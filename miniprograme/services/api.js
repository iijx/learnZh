// services/api.js —— 后端 API 封装（learnzh-api：登录 + 带 openid 的请求）
//
// 登录：wx.login 拿 code → POST /api/auth/login 换 openid，缓存在本地。
// 之后所有请求带 x-openid 头。openid 不过期（服务端按 openid upsert 用户），
// 只有缓存丢失或 401 时才重新登录。
var apiConfig = require('./api-config.js');

var OPENID_KEY = 'lz_openid';

var hasWx = typeof wx !== 'undefined' && typeof wx.request === 'function';

function rawGet(key, def) {
  if (!hasWx) return def;
  var v = wx.getStorageSync(key);
  return v === '' || v === undefined || v === null ? def : v;
}
function rawSet(key, value) {
  if (hasWx) wx.setStorageSync(key, value);
}

var _loginPromise = null;

function wxLogin() {
  return new Promise(function (resolve, reject) {
    wx.login({
      success: function (res) { res.code ? resolve(res.code) : reject(new Error('wx.login 无 code')); },
      fail: function (err) { reject(new Error((err && err.errMsg) || 'wx.login 失败')); }
    });
  });
}

function requestRaw(method, path, data, openid) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: apiConfig.BASE + path,
      method: method,
      data: data || {},
      header: openid ? { 'x-openid': openid } : {},
      success: function (res) {
        var body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && body.success) {
          resolve(body.data);
        } else {
          var err = new Error(body.error || ('HTTP ' + res.statusCode));
          err.statusCode = res.statusCode;
          reject(err);
        }
      },
      fail: function (err) { reject(new Error((err && err.errMsg) || '网络错误')); }
    });
  });
}

var api = {
  // 确保已登录，返回 openid；永不缓存失败结果（失败下次重试）
  ensureLogin: function () {
    var cached = rawGet(OPENID_KEY, '');
    if (cached) return Promise.resolve(cached);
    if (_loginPromise) return _loginPromise;
    if (!hasWx) return Promise.reject(new Error('非微信环境'));
    _loginPromise = wxLogin()
      .then(function (code) { return requestRaw('POST', '/api/auth/login', { code: code }, null); })
      .then(function (data) {
        rawSet(OPENID_KEY, data.openid);
        _loginPromise = null;
        return data.openid;
      })
      .catch(function (err) {
        _loginPromise = null;
        throw err;
      });
    return _loginPromise;
  },

  getOpenid: function () {
    return rawGet(OPENID_KEY, '');
  },

  // 已登录业务请求；401 时清缓存重登一次再重试
  request: function (method, path, data) {
    var self = this;
    return this.ensureLogin().then(function (openid) {
      return requestRaw(method, path, data, openid).catch(function (err) {
        if (err && err.statusCode === 401) {
          rawSet(OPENID_KEY, '');
          return self.ensureLogin().then(function (openid2) {
            return requestRaw(method, path, data, openid2);
          });
        }
        throw err;
      });
    });
  }
};

module.exports = api;
