// lib/cos.js —— 腾讯云 COS 封装（cos-nodejs-sdk-v5 回调接口 promise 化）
// 对象 Key 直接传 UTF-8（中文无需转义，SDK 内部处理）；客户端拼 URL 时才 encodeURIComponent。

var COS = require('cos-nodejs-sdk-v5');

function makeCos(cfg) {
  return new COS({
    SecretId: cfg.secretId,
    SecretKey: cfg.secretKey
  });
}

// 音频统一放 <prefix>/audio/ 子目录，避免与课程包（content-pipeline 的 manifest.json / chars.Ln.json）撞名
function objectKey(cfg, name) {
  return cfg.prefix.replace(/\/+$/, '') + '/audio/' + name;
}

// 上传 mp3（public-read，课程音频公开可读）
function putMp3(cos, cfg, key, buf) {
  return new Promise(function (resolve, reject) {
    cos.putObject({
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: objectKey(cfg, key + '.mp3'),
      Body: buf,
      ACL: 'public-read',
      ContentType: 'audio/mpeg'
    }, function (err, data) {
      if (err) {
        err.message = 'COS 上传失败 ' + (err.code || '') + '：' + (err.message || '');
        return reject(err);
      }
      resolve(data);
    });
  });
}

// 上传 JSON（manifest 等），同样 public-read
function putJson(cos, cfg, name, obj) {
  return new Promise(function (resolve, reject) {
    cos.putObject({
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: objectKey(cfg, name),
      Body: JSON.stringify(obj, null, 2),
      ACL: 'public-read',
      ContentType: 'application/json'
    }, function (err, data) {
      if (err) {
        err.message = 'COS 上传失败 ' + (err.code || '') + '：' + (err.message || '');
        return reject(err);
      }
      resolve(data);
    });
  });
}

// 对象是否已存在：存在 resolve(true)，404 表示不存在 resolve(false)，其他错误 reject
function head(cos, cfg, key) {
  return new Promise(function (resolve, reject) {
    cos.headObject({
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: objectKey(cfg, key + '.mp3')
    }, function (err, data) {
      if (err && (err.statusCode === 404 || err.statusCode === '404')) return resolve(false);
      if (err) {
        err.message = 'COS 查询失败 ' + (err.code || '') + '：' + (err.message || '');
        return reject(err);
      }
      resolve(true);
    });
  });
}

module.exports = { makeCos: makeCos, putMp3: putMp3, putJson: putJson, head: head, objectKey: objectKey };
