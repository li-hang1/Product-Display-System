/**
 * 二维码商品展示系统 · 服务端
 * 适用场景：线下木耳批发店，顾客扫二维码查看商品信息
 * 技术栈：Node.js + Express，JSON 文件存储，无需安装数据库
 */
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');

/* ---------------- 目录与数据文件初始化 ---------------- */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

ensureDir(DATA_DIR);
ensureDir(UPLOAD_DIR);

/* 首次启动写入演示商品，方便立刻体验，可在后台删除 */
const DEMO_PRODUCTS = [
  {
    code: 'MD001',
    name: '东北精选秋耳',
    variety: '秋耳',
    origin: '黑龙江',
    size: '中大片',
    color: '黑褐色',
    impurity: '无杂质',
    rooted: '已去根',
    soakRate: '1斤可泡发10斤',
    process: '自然晾晒、人工去根、分拣、杀菌包装',
    shelfLife: '18个月',
    additive: '无',
    features:
      '肉厚、泡发率高、无根。朵形完整、背面筋脉少，泡发后色泽黑亮、口感爽脆，适合餐馆采购与家庭囤货。',
    price: '50元/斤',
    phone: '13800000000',
    wechat: 'muer8888',
    image: '',
    gallery: [],
    wechatQr: '',
    createdAt: new Date().toISOString()
  }
];
if (!fs.existsSync(PRODUCTS_FILE)) writeJson(PRODUCTS_FILE, DEMO_PRODUCTS);

const DEFAULT_SETTINGS = {
  shopName: '诚信木耳批发商行', // 手机页面底部展示的商家名称
  siteUrl: '',                  // 二维码指向的地址（如 http://192.168.1.100:3000），留空则自动使用当前访问地址
  password: 'admin123'          // 后台登录密码
};

const settings = Object.assign({}, DEFAULT_SETTINGS, readJson(SETTINGS_FILE, {}));
writeJson(SETTINGS_FILE, settings);

let products = readJson(PRODUCTS_FILE, []);
if (!Array.isArray(products)) products = [];

const saveProducts = () => writeJson(PRODUCTS_FILE, products);
const saveSettings = () => writeJson(SETTINGS_FILE, settings);

/* ---------------- 登录令牌（HMAC 签名 Cookie） ---------------- */
let SECRET = null;
if (fs.existsSync(SECRET_FILE)) {
  SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
} else {
  SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, SECRET, 'utf8');
}
const TOKEN_MAX_AGE = 7 * 24 * 3600; // 秒，7 天免登录

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}
function makeToken() {
  const payload = String(Date.now());
  return payload + '.' + sign(payload);
}
function verifyToken(token) {
  if (!token) return false;
  const idx = token.indexOf('.');
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expect = sign(payload);
  if (sig.length !== expect.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return false;
  return Date.now() - Number(payload) < TOKEN_MAX_AGE * 1000;
}
function getCookie(req, name) {
  const list = String(req.headers.cookie || '').split(';');
  for (const item of list) {
    const seg = item.trim();
    const eq = seg.indexOf('=');
    if (eq < 0) continue;
    if (seg.slice(0, eq) === name) return decodeURIComponent(seg.slice(eq + 1));
  }
  return '';
}
function isLogin(req) {
  return verifyToken(getCookie(req, 'shop_token'));
}
function requireLogin(req, res, next) {
  if (!isLogin(req)) return res.status(401).json({ error: '未登录或登录已过期，请重新登录' });
  next();
}

/* ---------------- 工具函数 ---------------- */
const CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;
const EXT_WHITELIST = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function pickString(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function fileUrl(f) {
  return '/uploads/' + f.filename;
}
function safeUnlink(url) {
  if (typeof url !== 'string' || url.indexOf('/uploads/') !== 0) return;
  const p = path.join(UPLOAD_DIR, path.basename(url));
  if (fs.existsSync(p)) fs.unlink(p, () => {});
}
function buildProductUrl(req, code) {
  let base = pickString(settings.siteUrl).replace(/\/+$/, '');
  if (!base) base = req.protocol + '://' + (req.get('host') || 'localhost:' + PORT);
  return base + '/product/' + encodeURIComponent(code);
}

/* ---------------- 图片上传（multer） ---------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (EXT_WHITELIST.indexOf(ext) < 0) ext = '.jpg';
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => {
    if (/^image\//i.test(file.mimetype || '')) return cb(null, true);
    cb(new Error('只能上传图片文件（jpg / png / webp / gif）'));
  }
});
const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'gallery', maxCount: 9 },
  { name: 'wechatQr', maxCount: 1 }
]);

/* ---------------- 应用与静态资源 ---------------- */
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.redirect('/admin/index.html'));
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));

/* 手机端商品页（静态壳，数据由页面内 fetch 获取） */
app.get('/product/:code', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'product.html'));
});

/* ---------------- 登录 / 登出 ---------------- */
app.post('/api/login', (req, res) => {
  const password = pickString((req.body || {}).password);
  if (!password || password !== settings.password) {
    return res.status(401).json({ error: '密码错误，请重试' });
  }
  res.setHeader(
    'Set-Cookie',
    'shop_token=' + encodeURIComponent(makeToken()) +
      '; Path=/; Max-Age=' + TOKEN_MAX_AGE + '; HttpOnly; SameSite=Lax'
  );
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'shop_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  res.json({ ok: true });
});

app.get('/api/auth-check', (req, res) => {
  if (isLogin(req)) return res.json({ ok: true });
  res.status(401).json({ error: 'unauthorized' });
});

/* ---------------- 商品接口 ---------------- */
app.get('/api/products', requireLogin, (req, res) => {
  res.json(products);
});

app.get('/api/products/:code', (req, res) => {
  const code = pickString(req.params.code).toUpperCase();
  const product = products.find((p) => p.code === code);
  if (!product) return res.status(404).json({ error: '商品不存在或已下架' });
  res.json({ product, shopName: settings.shopName });
});

app.post('/api/products', requireLogin, uploadFields, (req, res) => {
  const b = req.body || {};
  const code = pickString(b.code).toUpperCase();
  const name = pickString(b.name);
  if (!CODE_RE.test(code)) {
    return res.status(400).json({ error: '商品编号只能包含字母、数字、中划线、下划线，长度 1-32 位' });
  }
  if (!name) return res.status(400).json({ error: '请填写商品名称' });
  if (products.some((p) => p.code === code)) {
    return res.status(400).json({ error: '商品编号 ' + code + ' 已存在，请换一个' });
  }
  const product = {
    code,
    name,
    variety: pickString(b.variety),
    origin: pickString(b.origin),
    size: pickString(b.size),
    color: pickString(b.color),
    impurity: pickString(b.impurity),
    rooted: pickString(b.rooted),
    soakRate: pickString(b.soakRate),
    process: pickString(b.process),
    shelfLife: pickString(b.shelfLife),
    additive: pickString(b.additive),
    features: pickString(b.features),
    price: pickString(b.price),
    phone: pickString(b.phone),
    wechat: pickString(b.wechat),
    image: req.files && req.files.image ? fileUrl(req.files.image[0]) : '',
    gallery: (req.files && req.files.gallery ? req.files.gallery : []).map(fileUrl),
    wechatQr: req.files && req.files.wechatQr ? fileUrl(req.files.wechatQr[0]) : '',
    createdAt: new Date().toISOString()
  };
  products.push(product);
  saveProducts();
  res.json(product);
});

app.put('/api/products/:code', requireLogin, uploadFields, (req, res) => {
  const oldCode = pickString(req.params.code).toUpperCase();
  const old = products.find((p) => p.code === oldCode);
  if (!old) return res.status(404).json({ error: '商品不存在' });

  const b = req.body || {};
  const code = pickString(b.code).toUpperCase() || oldCode;
  const name = pickString(b.name);
  if (!CODE_RE.test(code)) return res.status(400).json({ error: '商品编号格式不正确' });
  if (!name) return res.status(400).json({ error: '请填写商品名称' });
  if (products.some((p) => p.code === code && p.code !== oldCode)) {
    return res.status(400).json({ error: '商品编号 ' + code + ' 已被其他商品使用' });
  }

  // 客户端回传的“保留旧图”清单
  let keepGallery = [];
  try {
    const parsed = JSON.parse(b.keepGallery || '[]');
    if (Array.isArray(parsed)) keepGallery = parsed.filter((u) => typeof u === 'string');
  } catch (e) {
    /* 非法 JSON 时视为全部不保留 */
  }
  const keepImage = pickString(b.keepImage);
  const keepWechatQr = pickString(b.keepWechatQr);

  const newImage = req.files && req.files.image ? fileUrl(req.files.image[0]) : '';
  const newGallery = (req.files && req.files.gallery ? req.files.gallery : []).map(fileUrl);
  const newWechatQr = req.files && req.files.wechatQr ? fileUrl(req.files.wechatQr[0]) : '';

  const finalImage = newImage || (keepImage === old.image ? old.image : '');
  const finalGallery = keepGallery.concat(newGallery);
  const finalWechatQr = newWechatQr || (keepWechatQr === old.wechatQr ? old.wechatQr : '');

  // 清理被替换或被删除的旧图片文件
  if (old.image && old.image !== finalImage) safeUnlink(old.image);
  (old.gallery || []).forEach((u) => {
    if (finalGallery.indexOf(u) < 0) safeUnlink(u);
  });
  if (old.wechatQr && old.wechatQr !== finalWechatQr) safeUnlink(old.wechatQr);

  Object.assign(old, {
    code,
    name,
    variety: pickString(b.variety),
    origin: pickString(b.origin),
    size: pickString(b.size),
    color: pickString(b.color),
    impurity: pickString(b.impurity),
    rooted: pickString(b.rooted),
    soakRate: pickString(b.soakRate),
    process: pickString(b.process),
    shelfLife: pickString(b.shelfLife),
    additive: pickString(b.additive),
    features: pickString(b.features),
    price: pickString(b.price),
    phone: pickString(b.phone),
    wechat: pickString(b.wechat),
    image: finalImage,
    gallery: finalGallery,
    wechatQr: finalWechatQr
  });
  saveProducts();
  res.json(old);
});

app.delete('/api/products/:code', requireLogin, (req, res) => {
  const code = pickString(req.params.code).toUpperCase();
  const idx = products.findIndex((p) => p.code === code);
  if (idx < 0) return res.status(404).json({ error: '商品不存在' });
  const removed = products.splice(idx, 1)[0];
  saveProducts();
  if (removed.image) safeUnlink(removed.image);
  (removed.gallery || []).forEach(safeUnlink);
  if (removed.wechatQr) safeUnlink(removed.wechatQr);
  res.json({ ok: true });
});

/* ---------------- 二维码 ---------------- */
app.get('/api/qrcode-data/:code', (req, res) => {
  const code = pickString(req.params.code).toUpperCase();
  const product = products.find((p) => p.code === code);
  if (!product) return res.status(404).json({ error: '商品不存在' });
  res.json({ url: buildProductUrl(req, code), name: product.name });
});

app.get('/api/qrcode/:code', async (req, res) => {
  const code = pickString(req.params.code).toUpperCase();
  const product = products.find((p) => p.code === code);
  if (!product) return res.status(404).json({ error: '商品不存在' });
  try {
    const buffer = await QRCode.toBuffer(buildProductUrl(req, code), {
      type: 'png',
      width: 800,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000ff', light: '#ffffffff' }
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    if (req.query.download) {
      res.set('Content-Disposition', 'attachment; filename="qrcode-' + code + '.png"');
    }
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: '二维码生成失败' });
  }
});

/* ---------------- 系统设置 ---------------- */
app.get('/api/settings', requireLogin, (req, res) => {
  res.json({ shopName: settings.shopName, siteUrl: settings.siteUrl });
});

app.post('/api/settings', requireLogin, (req, res) => {
  const b = req.body || {};
  if (typeof b.shopName === 'string' && b.shopName.trim()) settings.shopName = b.shopName.trim();
  settings.siteUrl =
    typeof b.siteUrl === 'string' ? b.siteUrl.trim().replace(/\/+$/, '') : settings.siteUrl;
  const newPassword = pickString(b.passwordNew);
  if (newPassword) {
    if (pickString(b.passwordCurrent) !== settings.password) {
      return res.status(400).json({ error: '当前密码不正确，无法修改新密码' });
    }
    if (newPassword.length < 4) return res.status(400).json({ error: '新密码至少 4 位' });
    settings.password = newPassword;
  }
  saveSettings();
  res.json({ ok: true, shopName: settings.shopName, siteUrl: settings.siteUrl });
});

/* 服务器信息：供设置页展示局域网地址，方便手机测试 */
app.get('/api/server-info', requireLogin, (req, res) => {
  const addresses = [];
  const nets = os.networkInterfaces() || {};
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((n) => {
      if ((n.family === 'IPv4' || n.family === 4) && !n.internal) {
        addresses.push({ name, address: n.address });
      }
    });
  });
  res.json({ port: PORT, addresses });
});

/* ---------------- 404 与错误处理 ---------------- */
app.use((req, res) => {
  if (req.path.indexOf('/api/') === 0) return res.status(404).json({ error: '接口不存在' });
  res
    .status(404)
    .send(
      '<meta charset="utf-8"><title>404</title><body style="font-family:sans-serif;text-align:center;padding-top:80px">' +
        '<h2>404 · 页面不存在</h2><a href="/">返回首页</a></body>'
    );
});

app.use((err, req, res, next) => {
  let msg = err && err.message ? err.message : '服务器内部错误';
  if (err && err.code === 'LIMIT_FILE_SIZE') msg = '单张图片不能超过 10MB';
  if (err && err.code === 'LIMIT_FILE_COUNT') msg = '一次最多上传 12 张图片';
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') msg = '上传字段不正确';
  console.error('[错误]', req.method, req.url, msg);
  res.status(400).json({ error: msg });
});

/* ---------------- 启动 ---------------- */
const server = app.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  const nets = os.networkInterfaces() || {};
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((n) => {
      if ((n.family === 'IPv4' || n.family === 4) && !n.internal) ips.push(n.address);
    });
  });
  console.log('====================================================');
  console.log('  二维码商品展示系统 启动成功');
  console.log('----------------------------------------------------');
  console.log('  电脑访问后台:  http://localhost:' + PORT + '/admin/index.html');
  ips.forEach((ip) => {
    console.log('  手机测试地址:  http://' + ip + ':' + PORT + '   (手机需与电脑同一Wi-Fi)');
  });
  console.log('  默认管理密码:  admin123');
  console.log('====================================================');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('[启动失败] 端口 ' + PORT + ' 已被占用。可先关闭占用程序，或用其他端口启动：');
    console.error('  （cmd 运行）set PORT=8080 && node server.js');
  } else {
    console.error('[启动失败]', e.message);
  }
  process.exit(1);
});
