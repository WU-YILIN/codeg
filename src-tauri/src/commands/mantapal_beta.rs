//! Desktop-only Sub2API account bridge for the Mantapal beta.
//!
//! This layer deliberately does not alter ACP or the model gateway. The user's
//! account JWT is kept in the operating-system keyring. Only a newly created,
//! user-owned gateway key is passed to the existing Model Provider service.
//! Beta provisioning creates a provider WITHOUT binding it to an Agent.

use std::time::Duration;

use reqwest::{Client, Method, StatusCode, Url};
use serde_json::{json, Value};
use tauri::State;

use crate::db::AppDatabase;
use crate::keyring_store;

const ROOT_SECRET: &str = "mantapal-beta-service-root";
const ACCESS_SECRET: &str = "mantapal-beta-access-token";
const REFRESH_SECRET: &str = "mantapal-beta-refresh-token";
const MAX_REPLY_BYTES: usize = 4 * 1024 * 1024;
static SESSION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn normalize_root(raw: &str) -> Result<String, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "请输入有效的 Sub2API 服务地址".to_string())?;
    let host = url.host_str().ok_or("服务地址缺少主机名")?;
    let local = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err("服务地址必须使用 HTTPS（仅 localhost 可使用 HTTP）".into());
    }
    if !url.username().is_empty() || url.password().is_some() ||
        url.query().is_some() || url.fragment().is_some() {
        return Err("服务地址不能包含账号、密码、查询参数或片段".into());
    }
    let path = url.path().trim_end_matches('/');
    if !matches!(path, "" | "/" | "/api/v1" | "/v1" | "/v1beta") {
        return Err("请填写服务站点根地址，或以 /api/v1、/v1 结尾的地址".into());
    }
    Ok(url.origin().ascii_serialization())
}

fn load_secret(key: &str) -> Result<Option<String>, String> {
    keyring_store::get_secret(key).map_err(|_| "无法读取系统凭据存储".to_string())
}

fn save_secret(key: &str, value: &str) -> Result<(), String> {
    keyring_store::set_secret(key, value).map_err(|_| "无法写入系统凭据存储".to_string())
}

fn clear_secret(key: &str) -> Result<(), String> {
    keyring_store::delete_secret(key).map_err(|_| "无法清理系统凭据存储".to_string())
}

fn stored_root() -> Result<Option<String>, String> {
    load_secret(ROOT_SECRET)
}

struct Reply {
    status: StatusCode,
    code: i64,
    message: String,
    data: Value,
}

async fn request(
    root: &str,
    method: Method,
    path: &str,
    access: Option<&str>,
    body: Option<Value>,
) -> Result<Reply, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "网络客户端初始化失败".to_string())?;
    let url = format!("{root}/api/v1{path}");
    let mut builder = client.request(method, url).header("Accept", "application/json");
    if let Some(token) = access {
        builder = builder.bearer_auth(token);
    }
    if let Some(body) = body {
        builder = builder.json(&body);
    }
    let res = builder.send().await.map_err(|_| "连接 Sub2API 失败，请检查服务地址与网络".to_string())?;
    let status = res.status();
    if let Some(length) = res.content_length() {
        if length > MAX_REPLY_BYTES as u64 {
            return Err("服务器响应过大".into());
        }
    }
    let bytes = res.bytes().await.map_err(|_| "读取 Sub2API 响应失败".to_string())?;
    if bytes.len() > MAX_REPLY_BYTES {
        return Err("服务器响应超过大小限制".into());
    }
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| format!("服务器未返回预期 JSON（HTTP {}）", status.as_u16()))?;
    Ok(Reply {
        status,
        code: value.get("code").and_then(Value::as_i64).unwrap_or(-1),
        message: value.get("message").and_then(Value::as_str).unwrap_or("请求失败").to_string(),
        data: value.get("data").cloned().unwrap_or(Value::Null),
    })
}

fn successful(reply: Reply) -> Result<Value, String> {
    if reply.status.is_success() && reply.code == 0 {
        Ok(reply.data)
    } else {
        Err(format!("{}（HTTP {}）", reply.message, reply.status.as_u16()))
    }
}

fn persist_pair(root: &str, data: &Value) -> Result<(), String> {
    let access = data.get("access_token").and_then(Value::as_str)
        .filter(|x| !x.is_empty()).ok_or("服务端没有返回 access_token")?;
    let refresh = data.get("refresh_token").and_then(Value::as_str).unwrap_or("");
    // Store the refresh token first: a failed write must not leave an access
    // token that looks like a complete login.
    save_secret(REFRESH_SECRET, refresh)?;
    if let Err(err) = save_secret(ACCESS_SECRET, access) {
        let _ = clear_secret(REFRESH_SECRET);
        return Err(err);
    }
    if let Err(error) = save_secret(ROOT_SECRET, root) {
        let _ = clear_secret(ACCESS_SECRET);
        let _ = clear_secret(REFRESH_SECRET);
        return Err(error);
    }
    Ok(())
}

async fn authorized(root: &str, method: Method, path: &str, body: Option<Value>) -> Result<Value, String> {
    let access = load_secret(ACCESS_SECRET)?.ok_or("请先登录 Mantapal Cloud")?;
    let first = request(root, method.clone(), path, Some(&access), body.clone()).await?;
    if first.status != StatusCode::UNAUTHORIZED && first.code != 401 {
        return successful(first);
    }
    let refresh = load_secret(REFRESH_SECRET)?.filter(|v| !v.is_empty())
        .ok_or("会话已失效，请重新登录")?;
    let refreshed = successful(request(root, Method::POST, "/auth/refresh", None,
        Some(json!({ "refresh_token": refresh }))).await?)
        .map_err(|_| "登录状态已过期，请重新登录".to_string())?;
    persist_pair(root, &refreshed)?;
    let access = load_secret(ACCESS_SECRET)?.ok_or("刷新登录状态失败")?;
    successful(request(root, method, path, Some(&access), body).await?)
}

#[tauri::command]
pub async fn mantapal_beta_login(base_url: String, email: String, password: String) -> Result<Value, String> {
    let _guard = SESSION_LOCK.lock().await;
    let root = normalize_root(&base_url)?;
    if email.trim().is_empty() || password.is_empty() {
        return Err("请输入邮箱与密码".into());
    }
    let data = successful(request(&root, Method::POST, "/auth/login", None,
        Some(json!({ "email": email.trim(), "password": password }))).await?)?;
    if data.get("requires_2fa").and_then(Value::as_bool) == Some(true) {
        let temp = data.get("temp_token").and_then(Value::as_str)
            .ok_or("两步验证响应缺少临时令牌")?;
        return Ok(json!({
            "requires_2fa": true,
            "temp_token": temp,
            "email_masked": data.get("user_email_masked").and_then(Value::as_str).unwrap_or("")
        }));
    }
    persist_pair(&root, &data)?;
    Ok(json!({ "requires_2fa": false }))
}

#[tauri::command]
pub async fn mantapal_beta_login_2fa(
    base_url: String,
    temp_token: String,
    totp_code: String,
) -> Result<Value, String> {
    let _guard = SESSION_LOCK.lock().await;
    let root = normalize_root(&base_url)?;
    if totp_code.len() != 6 || !totp_code.chars().all(|c| c.is_ascii_digit()) {
        return Err("请输入 6 位两步验证码".into());
    }
    let data = successful(request(&root, Method::POST, "/auth/login/2fa", None,
        Some(json!({ "temp_token": temp_token, "totp_code": totp_code }))).await?)?;
    persist_pair(&root, &data)?;
    Ok(json!({ "requires_2fa": false }))
}

#[tauri::command]
pub async fn mantapal_beta_status() -> Result<Value, String> {
    let _guard = SESSION_LOCK.lock().await;
    let root = stored_root()?.unwrap_or_default();
    if root.is_empty() || load_secret(ACCESS_SECRET)?.is_none() {
        return Ok(json!({ "logged_in": false, "base_url": root }));
    }
    let user = authorized(&root, Method::GET, "/user/profile", None).await?;
    // Usage and subscription visibility should never prevent someone from
    // accessing their account or restoring connectivity during a panel outage.
    let usage = authorized(&root, Method::GET, "/usage/dashboard/stats", None).await.ok();
    let subscriptions = authorized(&root, Method::GET, "/subscriptions/active", None).await.ok();
    let groups = authorized(&root, Method::GET, "/groups/available", None).await.ok();
    Ok(json!({
        "logged_in": true,
        "base_url": root,
        "user": user,
        "usage": usage,
        "subscriptions": subscriptions,
        "groups": groups.unwrap_or_else(|| json!([]))
    }))
}

#[tauri::command]
pub async fn mantapal_beta_logout() -> Result<(), String> {
    let _guard = SESSION_LOCK.lock().await;
    let root = stored_root()?;
    let refresh = load_secret(REFRESH_SECRET)?;
    if let (Some(root), Some(refresh)) = (root, refresh) {
        let _ = request(&root, Method::POST, "/auth/logout", None,
            Some(json!({ "refresh_token": refresh }))).await;
    }
    // This ends the PANEL session only. Previously imported model keys are
    // user-owned API keys and must be revoked separately on the website.
    clear_secret(ACCESS_SECRET)?;
    clear_secret(REFRESH_SECRET)?;
    Ok(())
}

#[tauri::command]
pub async fn mantapal_beta_import_provider(
    agent_type: String,
    group_id: i64,
    model: String,
    db: State<'_, AppDatabase>,
) -> Result<Value, String> {
    let _guard = SESSION_LOCK.lock().await;
    let label = match agent_type.as_str() {
        "claude_code" => "Claude Code",
        "codex" => "Codex",
        "gemini" => "Gemini CLI",
        _ => return Err("内测版仅支持导入 Claude Code、Codex 和 Gemini CLI 的 Provider".into()),
    };
    if group_id <= 0 {
        return Err("请选择模型分组".into());
    }
    let root = stored_root()?.filter(|s| !s.is_empty()).ok_or("请先配置并登录服务")?;
    let groups = authorized(&root, Method::GET, "/groups/available", None).await?;
    let selected = groups.as_array().and_then(|items| items.iter().find(|g| {
        g.get("id").and_then(Value::as_i64) == Some(group_id)
    })).ok_or("该分组当前不对你的账户开放")?;
    let group_name = selected.get("name").and_then(Value::as_str).unwrap_or("未命名分组");
    let name = format!("Mantapal Cloud · {label} · {group_name}");
    let created = authorized(&root, Method::POST, "/keys", Some(json!({
        "name": name,
        "group_id": group_id,
        "concurrency_limit": 0
    }))).await?;
    let key_id = created.get("id").and_then(Value::as_i64).ok_or(
        "已创建 API Key，但无法识别返回编号，请在服务控制台检查密钥"
    )?;
    let key = created.get("key").and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or("已创建 API Key，但未返回凭据，请在服务控制台检查密钥")?;
    let base = if agent_type == "codex" { format!("{root}/v1") } else { root.clone() };
    let model = model.trim();
    let model_value = match agent_type.as_str() {
        "claude_code" => Some(json!({ "main": model }).to_string()),
        _ if !model.is_empty() => Some(model.to_string()),
        _ => None,
    };
    let created_provider = crate::commands::model_provider::create_model_provider_core(
        &db, name.clone(), base, key.to_string(), agent_type.clone(), model_value
    ).await;
    match created_provider {
        Ok(provider) => Ok(json!({
            "provider_id": provider.id,
            "key_id": key_id,
            "name": provider.name,
            "agent_type": agent_type
        })),
        Err(err) => {
            // Best effort: avoid a paid, orphaned key if local persistence fails.
            let cleanup = authorized(&root, Method::DELETE, &format!("/keys/{key_id}"), None).await;
            if cleanup.is_err() {
                return Err(format!("导入 Provider 失败：{err}。新建 API Key 未能自动清理，请到服务控制台撤销编号 {key_id}"));
            }
            Err(format!("导入 Provider 失败，已尝试清理新建 API Key：{err}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_root;

    #[test]
    fn accepts_secure_root_and_known_api_suffix() {
        assert_eq!(normalize_root("https://example.com/v1").unwrap(), "https://example.com");
        assert_eq!(normalize_root("https://example.com/api/v1").unwrap(), "https://example.com");
        assert_eq!(normalize_root("http://localhost:3000/").unwrap(), "http://localhost:3000");
    }

    #[test]
    fn refuses_insecure_remote_or_embedded_credentials() {
        assert!(normalize_root("http://example.com").is_err());
        assert!(normalize_root("https://user:pw@example.com").is_err());
        assert!(normalize_root("https://example.com/evil").is_err());
    }
}
