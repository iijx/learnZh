// lib/llm.js —— OpenAI 兼容 chat/completions 调用（零依赖，Node 18+ 全局 fetch）

// 调用一次，返回 assistant 文本；HTTP/网络错误抛带状态码的 Error
async function chat(messages, llmCfg) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, llmCfg.timeoutMs || 60000);
  try {
    var res = await fetch(llmCfg.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + llmCfg.apiKey
      },
      body: JSON.stringify({
        model: llmCfg.model,
        messages: messages,
        temperature: llmCfg.temperature,
        response_format: { type: 'json_object' }
      }),
      signal: ctrl.signal
    });
    var body = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + '：' + body.slice(0, 300));
    var data;
    try { data = JSON.parse(body); }
    catch (e) { throw new Error('响应不是 JSON：' + body.slice(0, 300)); }
    var content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    if (!content) throw new Error('响应缺少 choices[0].message.content');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// 从模型输出中解析 JSON 对象（容忍 ```json 围栏与前后杂谈）
function parseJson(text) {
  var s = String(text).trim();
  var fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  var start = s.indexOf('{');
  var end = s.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('输出中找不到 JSON 对象');
  return JSON.parse(s.slice(start, end + 1));
}

module.exports = { chat: chat, parseJson: parseJson };
