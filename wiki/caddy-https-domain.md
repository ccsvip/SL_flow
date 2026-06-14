# 使用 Caddy 绑定域名并自动签发 HTTPS 证书

本文说明如何在当前项目中使用 Docker Compose + Caddy 为域名绑定站点，并通过 Let's Encrypt 自动签发和续期 HTTPS 证书。

## 当前架构

当前项目由 Docker Compose 编排：

- `frontend`：前端静态站点与 `/api` 代理，容器内监听 `80`
- `backend`：FastAPI 后端，容器内监听 `8000`
- `db`：PostgreSQL
- `caddy`：公网入口，监听宿主机 `80` / `443`，反向代理到 `frontend:80`

访问链路：

```text
https://isxm.cn
  -> Caddy 容器 :443
  -> frontend 容器 :80
  -> /api 由 frontend Nginx 转发到 backend:8000
```

## 前置条件

1. 服务器有公网 IP。
2. 云服务器安全组或防火墙已放行 `80/tcp`、`443/tcp`，可选放行 `443/udp` 支持 HTTP/3。
3. 域名已经完成实名与可用的 DNS 委派。
4. 如果服务器在中国大陆，域名通常还需要完成 ICP 备案后才能稳定使用 `80` / `443` 对外提供网站服务。

## DNS 配置

以 `isxm.cn` 为例，将域名解析到服务器公网 IP：

```text
主机记录    类型      记录值
@           A         服务器公网 IP
www         CNAME     isxm.cn
```

也可以把 `www` 配成 A 记录，直接指向同一个服务器公网 IP。

配置后可以用下面命令检查：

```bash
dig isxm.cn
dig www.isxm.cn
dig NS isxm.cn
```

正常情况下，`dig isxm.cn` 应返回服务器公网 IP。如果返回 `SERVFAIL` 或 `No Reachable Authority`，说明域名权威 DNS 委派或解析服务本身仍有问题，Caddy 无法申请证书。

## Caddy 配置

当前 Caddy 配置文件位于：

```text
deploy/caddy/Caddyfile
```

内容：

```caddyfile
isxm.cn {
	encode zstd gzip
	reverse_proxy frontend:80
}

www.isxm.cn {
	redir https://isxm.cn{uri} permanent
}
```

说明：

- `isxm.cn`：主站域名，反向代理到当前项目的前端容器。
- `frontend:80`：Docker Compose 默认网络内的服务名和容器端口。
- `www.isxm.cn`：自动永久跳转到主域名。
- Caddy 会自动申请、保存、续期 HTTPS 证书。

如果要换成其他域名，只需要修改 `Caddyfile` 里的域名，并同步修改 DNS 解析。

## Docker Compose 配置

`docker-compose.yml` 中的 Caddy 服务监听公网端口，并挂载 Caddyfile 与证书数据卷：

```yaml
caddy:
  image: caddy:2-alpine
  container_name: slflow-caddy
  restart: unless-stopped
  depends_on:
    - frontend
  ports:
    - "80:80"
    - "443:443"
    - "443:443/udp"
  volumes:
    - ./deploy/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
    - caddy_config:/config
```

证书和 ACME 账号数据保存在 Docker volume 中：

```yaml
volumes:
  caddy_data:
  caddy_config:
```

不要随意删除 `caddy_data`，否则 Caddy 会重新申请证书，频繁操作可能触发 Let's Encrypt 频率限制。

## 部署命令

在项目根目录执行：

```bash
docker compose up -d --build
```

如果只是修改了 Caddy 配置，可以重启 Caddy：

```bash
docker compose restart caddy
```

查看运行状态：

```bash
docker compose ps
```

查看 Caddy 日志：

```bash
docker compose logs caddy --tail=100
```

## 验证 HTTPS

DNS 生效后，访问：

```text
https://isxm.cn
```

也可以用命令验证：

```bash
curl -I https://isxm.cn
curl -I http://isxm.cn
```

正常情况下：

- `https://isxm.cn` 返回 `200`
- `http://isxm.cn` 返回 `308 Permanent Redirect`，跳转到 HTTPS
- `www.isxm.cn` 跳转到 `https://isxm.cn`

## 常见问题

### 证书申请失败：DNS problem

日志示例：

```text
DNS problem: SERVFAIL looking up A for isxm.cn
No Reachable Authority
```

处理方式：

1. 检查域名注册商处的 DNS 服务器是否设置正确。
2. 检查 DNS 服务商处是否配置了 `@` 和 `www` 记录。
3. 使用 `dig isxm.cn` 确认公网能解析到服务器 IP。
4. DNS 正常后执行 `docker compose restart caddy` 触发重试，或等待 Caddy 自动重试。

### 80 或 443 端口启动失败

如果 Caddy 启动时报端口占用，检查宿主机是否已有 Nginx、Apache 或其他服务占用了 `80` / `443`：

```bash
ss -lntp | grep -E ':80|:443'
```

需要停止冲突服务，或改为让宿主机已有反代服务转发到当前项目。

### HTTPS 可以打开但接口失败

当前前端使用 `/api` 相对路径访问后端，正常情况下不需要额外 CORS 配置。若接口失败，检查：

```bash
docker compose logs frontend --tail=100
docker compose logs backend --tail=100
```

同时确认 `frontend/nginx.conf` 中 `/api/` 仍然代理到：

```text
http://backend:8000
```

## 运维建议

- 保持 `caddy_data` 和 `caddy_config` 两个 volume，不要清理。
- 域名切换前先确认 DNS 已经生效，再重启 Caddy。
- 生产环境建议只暴露 `80` / `443` 给公网，后端 `8000` 可按需改为仅本机访问。
- 修改 Caddyfile 后先执行 `docker compose restart caddy`，再查看日志确认配置生效。
