# GitHub 访问策略

本机（Windows，带代理）访问 GitHub 的已知情况与推荐做法。

## 已验证事实

| 方式 | 状态 |
|---|---|
| `git clone https://github.com/...` | ✅ **可用**（首选） |
| `curl https://github.com/...` | ❌ exit 35（SSL connect error，代理把 TLS 弄坏） |
| `cdn.jsdelivr.net/gh/...` | ✅ 可用（jsDelivr CDN，HTTP 200） |
| GitHub 镜像（ghproxy 等） | ⚠️ 时通时不通（曾 504） |

## 推荐策略

1. **整仓下载**：`git clone --depth 1 https://github.com/<owner>/<repo>.git <dir>`
   - 浅克隆，快；日常够用。
2. **单文件**：`curl https://cdn.jsdelivr.net/gh/<owner>/<repo>@<branch>/<path>`
   - 用 jsDelivr 而非直接 GitHub raw（raw 也可能走 curl 挂）。
3. **网页/搜索**：`https://github.com/topics/dsh-plugin` 等页面抓取——**WebFetch 可能被安全校验挡**，用可解锁抓取的工具（如 Bright Data / firecrawl）。

## 给小白用户的话

- 不需要登录 GitHub 就能 clone 公开仓库。
- 下载不下来时先试 `git clone`，别先怀疑网络。
- 报 SSL/exit 35 时：是代理问题，换 git clone 或 jsDelivr 即可绕开。
