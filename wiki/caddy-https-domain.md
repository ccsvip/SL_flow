# Docker 使用 Caddy 绑定域名并自动签发 HTTPS 证书

本文是一份通用教程，说明如何用 Docker 部署 Caddy，为任意 Web 应用绑定域名，并自动申请、续期 HTTPS 证书。

Caddy 支持自动 HTTPS。只要域名 DNS 正确指向服务器，服务器 `80` / `443` 端口可访问，Caddy 就会自动通过 ACME 协议向 Let's Encrypt 等证书机构申请证书，并在证书到期前自动续期。

## 适用场景

适合以下部署方式：

- 一个 Docker Web 应用需要绑定域名。
- 多个 Docker Web 应用需要通过不同域名访问。
- 不想手动申请、上传、续期 SSL 证书。
- 希望用一个反向代理统一管理 HTTP -> HTTPS、域名转发和证书。

## 基本访问链路

```text
用户浏览器
  -> https://your-domain.com
  -> 服务器 443 端口
  -> Caddy 容器
  -> 目标 Web 应用容器或宿主机端口
```

## 前置条件

部署前需要确认：

1. 服务器有公网 IP。
2. 域名已经完成实名、注册商状态正常。
3. 域名 DNS 已经指向服务器公网 IP。
4. 服务器安全组、防火墙已放行：
   - `80/tcp`
   - `443/tcp`
   - `443/udp` 可选，用于 HTTP/3
5. 宿主机上没有其他程序占用 `80` / `443`，例如 Nginx、Apache、宝塔面板等。
6. 如果服务器在中国大陆，通常需要先完成 ICP 备案，否则网站可能无法正常使用 `80` / `443` 对外访问。

## DNS 配置

假设：

```text
域名：example.com
服务器公网 IP：1.2.3.4
```

在 DNS 服务商处添加：

```text
主机记录    类型      记录值
@           A         1.2.3.4
www         CNAME     example.com
```

也可以把 `www` 配成 A 记录：

```text
www         A         1.2.3.4
```

检查 DNS：

```bash
dig example.com
dig www.example.com
dig NS example.com
```

正常情况下，`dig example.com` 应该返回服务器公网 IP。

如果返回 `SERVFAIL`、`No Reachable Authority` 或没有 A 记录，说明 DNS 尚未正确生效。此时 Caddy 无法申请证书。

## 方式一：Caddy 和应用在同一个 Docker Compose 中

这是最推荐的方式。Caddy 可以直接通过 Docker Compose 的服务名访问目标应用。

### 目录结构

```text
project/
  docker-compose.yml
  Caddyfile
```

### docker-compose.yml

示例中：

- `app` 是你的 Web 应用容器。
- `app` 容器内监听 `80`。
- Caddy 通过 `reverse_proxy app:80` 转发请求。

```yaml
services:
  app:
    image: your-app-image:latest
    restart: unless-stopped
    expose:
      - "80"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
```

说明：

- `ports` 只需要暴露在 Caddy 上。
- 应用容器可以使用 `expose`，不一定要把端口暴露到宿主机公网。
- `caddy_data` 用来保存证书、ACME 账号等重要数据。
- 不要频繁删除 `caddy_data`，否则可能触发证书机构的申请频率限制。

### Caddyfile

```caddyfile
example.com {
	reverse_proxy app:80
}
```

如果需要 `www` 跳转到主域名：

```caddyfile
example.com {
	reverse_proxy app:80
}

www.example.com {
	redir https://example.com{uri} permanent
}
```

如果要同时支持多个域名访问同一个应用：

```caddyfile
example.com, www.example.com {
	reverse_proxy app:80
}
```

## 方式二：Caddy 反向代理到宿主机端口

如果你的应用已经在宿主机或另一个 Compose 项目中运行，例如：

```text
http://127.0.0.1:8080
```

可以让 Caddy 转发到宿主机端口。

### docker-compose.yml

Linux Docker 环境建议增加 `host.docker.internal` 映射：

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
```

### Caddyfile

```caddyfile
example.com {
	reverse_proxy host.docker.internal:8080
}
```

这种方式适合：

- 应用不在同一个 Compose 文件中。
- 应用直接运行在宿主机端口。
- 想先保留已有部署，只增加 HTTPS 入口。

## 方式三：多个域名绑定多个应用

同一个 Caddy 可以代理多个站点。

```yaml
services:
  app1:
    image: app1-image:latest
    expose:
      - "80"

  app2:
    image: app2-image:latest
    expose:
      - "3000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - app1
      - app2
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
```

Caddyfile：

```caddyfile
app1.example.com {
	reverse_proxy app1:80
}

app2.example.com {
	reverse_proxy app2:3000
}
```

每个域名都需要提前配置 DNS。

## 启动和更新

启动：

```bash
docker compose up -d
```

查看容器状态：

```bash
docker compose ps
```

修改 Caddyfile 后重启：

```bash
docker compose restart caddy
```

查看 Caddy 日志：

```bash
docker compose logs caddy --tail=100
```

如果需要重新构建应用镜像：

```bash
docker compose up -d --build
```

## 验证 HTTPS

检查 HTTP 是否自动跳转到 HTTPS：

```bash
curl -I http://example.com
```

常见结果：

```text
HTTP/1.1 308 Permanent Redirect
Location: https://example.com/
Server: Caddy
```

检查 HTTPS：

```bash
curl -I https://example.com
```

浏览器访问：

```text
https://example.com
```

如果证书已经签发成功，浏览器地址栏应显示安全锁标识。

## 常见问题

### 证书一直申请失败

查看日志：

```bash
docker compose logs caddy --tail=100
```

常见原因：

- 域名 A 记录没有指向当前服务器。
- DNS 还没有生效。
- 域名的 NS 委派错误。
- 服务器安全组没有放行 `80` / `443`。
- 宿主机有其他程序占用了 `80` / `443`。
- CDN 或代理服务配置不正确。

### 日志出现 DNS problem

示例：

```text
DNS problem: SERVFAIL looking up A for example.com
No Reachable Authority
```

处理步骤：

```bash
dig example.com
dig NS example.com
```

确认：

- 域名有可用的权威 DNS。
- A 记录返回服务器公网 IP。
- `www` 记录存在并指向正确目标。

修复 DNS 后，可以等待 Caddy 自动重试，也可以执行：

```bash
docker compose restart caddy
```

### 80 或 443 端口被占用

检查端口：

```bash
ss -lntp | grep -E ':80|:443'
```

如果已有 Nginx、Apache、宝塔面板等程序占用端口，需要停止冲突服务，或改为由已有反向代理转发到 Caddy / 应用。

### 应用容器访问不到

如果 Caddy 和应用在同一个 Compose 文件中，`reverse_proxy` 应使用服务名和容器端口：

```caddyfile
example.com {
	reverse_proxy app:80
}
```

不要写成：

```caddyfile
example.com {
	reverse_proxy localhost:80
}
```

在 Caddy 容器内部，`localhost` 指的是 Caddy 容器自己，不是应用容器。

### 上传文件过大

Caddy 默认不会像 Nginx 那样用 `client_max_body_size` 限制请求体。实际上传大小通常受应用本身、后端网关或上游服务限制。

如果应用层有限制，需要在应用或后端代理中调整。

## 运维建议

- 将 Caddy 作为唯一公网入口，只开放 `80` / `443`。
- 应用容器尽量不要直接暴露到公网，优先使用 Docker 内部网络。
- 保留 `caddy_data`，它包含证书和 ACME 账号数据。
- 修改域名前，先确认 DNS 生效，再重启 Caddy。
- 多个站点共用一个 Caddy 时，统一维护一个 Caddyfile。
- 生产环境建议定期查看 Caddy 日志，确认自动续期没有失败。

## 最小可用模板

将下面内容保存为 `docker-compose.yml`：

```yaml
services:
  app:
    image: your-app-image:latest
    expose:
      - "80"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
```

将下面内容保存为 `Caddyfile`：

```caddyfile
example.com {
	reverse_proxy app:80
}
```

启动：

```bash
docker compose up -d
```

DNS 正确、端口放行后，Caddy 会自动完成 HTTPS 证书申请和续期。
