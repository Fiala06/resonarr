# Deploying Resonarr on Unraid

Resonarr ships as a single Docker image published to GitHub Container Registry
(GHCR) by CI on every push to `main`:

```
ghcr.io/fiala06/resonarr:latest
```

All secrets (Plex token, Lidarr API key, LLM keys) are injected as **container
environment variables** — they are never baked into the image.

---

## 1. Make the GHCR package pullable (one-time)

New GHCR packages are **private**. The image contains no secrets, so the
simplest path for Unraid is to make it **public**:

1. Go to <https://github.com/users/Fiala06/packages/container/resonarr/settings>
2. Scroll to **Danger Zone → Change visibility → Public**.

> Prefer to keep it private? Then on Unraid you must log the Docker daemon into
> GHCR first. Open the Unraid terminal and run:
> ```sh
> docker login ghcr.io -u Fiala06 -p <GITHUB_PAT_with_read:packages>
> ```
> (Create the PAT at GitHub → Settings → Developer settings → Tokens, scope
> `read:packages`.)

---

## 2. Add the container (Unraid Docker tab)

**Docker** tab → **Add Container**. Toggle the template editor to *Advanced
View* and set:

| Field | Value |
|---|---|
| **Name** | `resonarr` |
| **Repository** | `ghcr.io/fiala06/resonarr:latest` |
| **Network Type** | `Bridge` |
| **WebUI** | `http://[IP]:[PORT:8080]/` |

### Port

| Config Type | Name | Container Port | Host Port |
|---|---|---|---|
| Port | WebUI | `8080` | `8080` |

### Path (persistent config / SQLite — used from Phase 1 on)

| Config Type | Name | Container Path | Host Path |
|---|---|---|---|
| Path | config | `/config` | `/mnt/user/appdata/resonarr` |

### Environment variables

Add each as a **Variable** (Key → Value):

| Key | Value | Notes |
|---|---|---|
| `PLEX_URL` | `http://<unraid-or-plex-LAN-IP>:32400` | **Not** `localhost` — see note below |
| `PLEX_TOKEN` | *(your Plex token)* | server-side only |
| `LIDARR_URL` | `http://<lidarr-LAN-IP>:8686` | **Not** `localhost` |
| `LIDARR_API_KEY` | *(Lidarr → Settings → General → API Key)* | |
| `LLM_PROVIDER` | `claude` | `claude` \| `openai` \| `ollama` |
| `ANTHROPIC_API_KEY` | *(only if using Claude)* | |
| `PORT` | `8080` | matches the port mapping |

> ⚠️ **`localhost` from inside a container points at the container, not the
> host.** Use the LAN IP of the machine running Plex / Lidarr (often the Unraid
> server's own IP, e.g. `http://192.168.1.10:32400`). If Plex/Lidarr are *also*
> Unraid Docker containers on a custom network, you can use their container
> names instead.

Apply. Unraid pulls the image and starts the container.

---

## 3. Verify

1. Open `http://<unraid-ip>:8080/` — the Resonarr status page should load and
   show **Plex ✓** and **Lidarr ✓** once env vars are correct.
2. (Optional) Run the Phase 0 go/no-go spikes **from inside the container** —
   this is the most meaningful test because it runs on the Unraid network:
   ```sh
   docker exec resonarr npm run spike:plex -w server
   docker exec resonarr npm run spike:lidarr -w server
   ```
   `spike:plex` printing sonically-similar tracks confirms the entire sonic
   premise end-to-end.

---

## 4. Updating

Push to `main` → CI rebuilds `:latest`. On Unraid, click the container →
**Force update** (or use the auto-update plugin) to pull the new image.
