//! Mantapal software account integration (Free tier only).
//!
//! Independent of model-provider credentials and all ACP runtime configuration.
//! A user's own API keys/base URLs continue to work without signing in.
//! Pro entitlements and payment are intentionally NOT implemented here.

use std::time::Duration;

use reqwest::{Client, Method, StatusCode, Url};
use serde_json::{json, Value};

use crate::keyring_store;

const ACCESS_SECRET: &str = "mantapal-account-access";
const REFRESH_SECRET: &str = "mantapal-account-refresh";
const RESPONSE_LIMIT: usize = 1024 * 1024;
static ACCOUNT_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

// Set MANTAPAL_ACCOUNT_URL during the Rust/Tauri build, e.g.
// MANTAPAL_ACCOUNT_URL=https://accounts.example.com pnpm tauri build
// A release without this value does NOT guess an external account host.
fn account_origin() -> Result<String, String> {
    let raw = option_env!("MANTAPAL_ACCOUNT_URL").unwrap_or("").trim();
    if raw.is_empty() {
        return Err("Mantapal 账户服务尚未配置。BYOK 和本地 Agent 仍可正常使用。".into());
    }
    parse_origin(raw)
}

fn parse_origin(raw: &str) -> Result<String, String> {
    let url = Url::parse(raw).map_err(|_| "账户服务地址格式不正确".to_string())?;
    let host = url.host_str().ok_or("账户服务缺少域名")?;
    let loopback = matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]");
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        return Err("账户服务必须使用 HTTPS（本地测试除外）".into());
    }
    if !url.username().is_empty() || url.password().is_some() ||
        url.query().is_some() || url.fragment().is_some() ||
        !matches!(url.path(), "" | "/" | "/api/v1") {
        return Err("账户服务地址不能含用户信息、查询参数或业务路径".into());
    }
    Ok(url.origin().ascii_serialization())
}

fn get_secret(name: &str) -> Result<Option<String>, String> {
    keyring_store::get_secret(name).map_err(|_| "系统凭据存储读取失败".to_string())
}

fn put_secret(name: &str, value: &str) -> Result<(), String> {
    keyring_store::set_secret(name, value).map_err(|_| "系统凭据存储写入失败".to_string())
}

fn delete_secret(name: &str) -> Result<(), String> {
    keyring_store::delete_secret(name).map_err(|_| "系统凭据存储清理失败".to_string())
}

fn clear_session() -> Result<(), String> {
    let access = delete_secret(ACCESS_SECRET);
    let refresh = delete_secret(REFRESH_SECRET);
    access?;
    refresh
}

fn persist_tokens(data: &Value) -> Result<(), String> {
    let access = data.get("access_token").and_then(Value::as_str)
        .filter(|x| !x.is_empty()).ok_or("认证响应缺少 Access Token")?;
    let refresh = data.get("refresh_token").and_then(Value::as_str)
        .filter(|x| !x.is_empty()).ok_or("认证响应缺少 Refresh Token")?;
    // A partial keyring failure must not leave the old account authenticated.
    if let Err(err) = put_secret(REFRESH_SECRET, refresh)
        .and_then(|_| put_secret(ACCESS_SECRET, access)) {
        let _ = clear_session();
        return Err(err);
    }
    Ok(())
}

struct ApiReply {
    status: StatusCode,
    code: i64,
    data: Value,
    message: String,
}

async fn call_api(
    origin: &str,
    method: Method,
    path: &str,
    access: Option<&str>,
    body: Option<Value>,
) -> Result<ApiReply, String> {
    // Only callers in this module select fixed paths. Never interpolate paths
    // from an arbitrary webview value or follow redirects with a bearer token.
    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "无法初始化账户请求".to_string())?;
    let mut req = client.request(method, format!("{origin}/api/v1{path}"))
        .header("Accept", "application/json");
    if let Some(access) = access {
        req = req.bearer_auth(access);
    }
    if let Some(body) = body {
        req = req.json(&body);
    }
    let response = req.send().await.map_err(|_| "账户服务连接失败".to_string())?;
    let status = response.status();
    if response.content_length().is_some_and(|size| size > RESPONSE_LIMIT as u64) {
        return Err("账户响应超过大小限制".into());
    }
    let body = response.bytes().await.map_err(|_| "读取账户响应失败".to_string())?;
    if body.len() > RESPONSE_LIMIT {
        return Err("账户响应超过大小限制".into());
    }
    let payload: Value = serde_json::from_slice(&body)
        .map_err(|_| format!("账户服务响应不是有效 JSON（HTTP {}）", status.as_u16()))?;
    Ok(ApiReply {
        status,
        code: payload.get("code").and_then(Value::as_i64).unwrap_or(-1),
        data: payload.get("data").cloned().unwrap_or(Value::Null),
        message: payload.get("message").and_then(Value::as_str)
            .unwrap_or("请求失败").to_string(),
    })
}

fn accepted(reply: ApiReply) -> Result<Value, String> {
    if reply.status.is_success() && reply.code == 0 {
        Ok(reply.data)
    } else {
        Err(format!("{}（HTTP {}）", reply.message, reply.status.as_u16()))
    }
}

async fn authed(
    origin: &str,
    path: &str,
) -> Result<Value, String> {
    let access = get_secret(ACCESS_SECRET)?.ok_or("请先登录 Mantapal 账户")?;
    let response = call_api(origin, Method::GET, path, Some(&access), None).await?;
    if response.status != StatusCode::UNAUTHORIZED && response.code != 401 {
        return accepted(response);
    }
    let refresh = get_secret(REFRESH_SECRET)?
        .filter(|value| !value.is_empty())
        .ok_or("登录状态已失效，请重新登录")?;
    let new_tokens = match call_api(origin, Method::POST, "/auth/refresh", None,
        Some(json!({"refresh_token": refresh}))).await.and_then(accepted) {
        Ok(tokens) => tokens,
        Err(_) => {
            let _ = clear_session();
            return Err("会话已失效，请重新登录".into());
        }
    };
    persist_tokens(&new_tokens)?;
    let access = get_secret(ACCESS_SECRET)?.ok_or("刷新登录状态失败")?;
    accepted(call_api(origin, Method::GET, path, Some(&access), None).await?)
}

#[tauri::command]
pub async fn mantapal_account_config() -> Value {
    match account_origin() {
        Ok(origin) => json!({
            "configured": true,
            "origin": origin,
            "register_url": format!("{origin}/register"),
            "login_url": format!("{origin}/login")
        }),
        Err(error) => json!({"configured": false, "message": error}),
    }
}

#[tauri::command]
pub async fn mantapal_account_login(email: String, password: String) -> Result<Value, String> {
    let _guard = ACCOUNT_LOCK.lock().await;
    let origin = account_origin()?;
    if email.trim().is_empty() || password.is_empty() {
        return Err("请输入邮箱和密码".into());
    }
    let data = accepted(call_api(&origin, Method::POST, "/auth/login", None,
        Some(json!({"email": email.trim(), "password": password}))).await?)?;
    if data.get("requires_2fa").and_then(Value::as_bool) == Some(true) {
        let temp = data.get("temp_token").and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or("两步验证响应缺少临时令牌")?;
        return Ok(json!({"requires_2fa": true, "temp_token": temp}));
    }
    persist_tokens(&data)?;
    Ok(json!({"requires_2fa": false}))
}

#[tauri::command]
pub async fn mantapal_account_login_2fa(temp_token: String, totp_code: String) -> Result<(), String> {
    let _guard = ACCOUNT_LOCK.lock().await;
    let origin = account_origin()?;
    if totp_code.len() != 6 || !totp_code.chars().all(|ch| ch.is_ascii_digit()) {
        return Err("请输入六位验证码".into());
    }
    let data = accepted(call_api(&origin, Method::POST, "/auth/login/2fa", None,
        Some(json!({"temp_token": temp_token, "totp_code": totp_code}))).await?)?;
    persist_tokens(&data)
}

#[tauri::command]
pub async fn mantapal_account_status() -> Result<Value, String> {
    let _guard = ACCOUNT_LOCK.lock().await;
    let origin = account_origin()?;
    if get_secret(ACCESS_SECRET)?.is_none() {
        return Ok(json!({"authenticated": false}));
    }

    // The membership endpoint is the sole tier authority. No offline/local
    // "Pro" flag or inference from a Sub2API model-credit subscription.
    let profile = authed(&origin, "/user/profile").await?;
    // A deployed account server may temporarily be older than this client.
    // Keep the verified login visible without fabricating a local Free/Pro
    // status; membership remains unverified until its endpoint is available.
    let membership_result = authed(&origin, "/mantapal/membership").await;
    let (membership, membership_error) = match membership_result {
        Ok(value) if value.get("schema_version").and_then(Value::as_i64) == Some(1)
            && matches!(value.get("tier").and_then(Value::as_str), Some("free" | "pro")) =>
        {
            (value, None)
        }
        Ok(_) => (Value::Null, Some("会员服务返回了不支持的响应".to_string())),
        Err(err) => (Value::Null, Some(format!("会员状态尚未确认：{err}"))),
    };
    Ok(json!({
        "authenticated": true,
        "user": {
            "id": profile.get("id"),
            "email": profile.get("email"),
            "username": profile.get("username")
        },
        "membership": membership,
        "membership_error": membership_error
    }))
}

#[tauri::command]
pub async fn mantapal_account_logout() -> Result<(), String> {
    let _guard = ACCOUNT_LOCK.lock().await;
    let origin = account_origin().ok();
    let refresh = get_secret(REFRESH_SECRET)?;
    if let (Some(origin), Some(refresh)) = (origin, refresh) {
        // Server logout best effort; local credential destruction is required.
        let _ = call_api(&origin, Method::POST, "/auth/logout", None,
            Some(json!({"refresh_token": refresh}))).await;
    }
    clear_session()
}

#[cfg(test)]
mod tests {
    use super::parse_origin;

    #[test]
    fn accepts_secure_accounts_and_local_test_origin() {
        assert_eq!(parse_origin("https://account.example.com/api/v1").unwrap(), "https://account.example.com");
        assert_eq!(parse_origin("http://localhost:8080").unwrap(), "http://localhost:8080");
    }

    #[test]
    fn refuses_insecure_or_redirecting_account_roots() {
        assert!(parse_origin("http://account.example.com").is_err());
        assert!(parse_origin("https://user:password@account.example.com").is_err());
        assert!(parse_origin("https://account.example.com/evil").is_err());
        assert!(parse_origin("https://account.example.com?next=evil").is_err());
    }
}
