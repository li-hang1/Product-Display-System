/* 管理后台公共脚本：鉴权、请求封装、轻提示 */
async function requireAuth() {
  try {
    const res = await fetch('/api/auth-check');
    if (res.status === 401) {
      location.href = 'login.html';
      return false;
    }
    return true;
  } catch (e) {
    location.href = 'login.html';
    return false;
  }
}

/* 发送 JSON 请求：apiJSON(url, method, body) */
async function apiJSON(url, method, body) {
  const opts = { method: method || 'GET', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败 (' + res.status + ')');
  return data;
}

/* 发送表单请求（含文件上传）：apiForm(url, method, formData) */
async function apiForm(url, method, formData) {
  const res = await fetch(url, { method: method, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败 (' + res.status + ')');
  return data;
}

let __toastTimer = null;
function toast(msg, ok) {
  let el = document.getElementById('__toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '__toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'show' + (ok === false ? ' err' : '');
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => {
    el.className = '';
  }, 2200);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}
