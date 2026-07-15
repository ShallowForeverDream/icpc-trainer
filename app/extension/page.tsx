import { AppShell, Icon, Pill } from "../components/AppShell";

export default function ExtensionPage() {
  return <AppShell active="提交扩展">
    <section className="extension-hero">
      <div><span className="eyebrow"><span className="live-dot" /> CHROME / EDGE · MANIFEST V3</span><h1>留在平台，<br /><em>直接完成提交。</em></h1><p>支持 Codeforces、Codeforces Gym 与 Universal Cup / QOJ。点击站内“直接提交”后，扩展使用你浏览器已有的登录会话在后台完成提交。</p><div className="hero-actions"><a className="button button-primary" href="/icpc-trainer-extension.zip" download><Icon name="spark" /> 下载扩展包 v0.9</a></div></div>
      <div className="extension-flow"><div><b>01</b><span>选择文件或粘贴代码</span><Pill>站内完成</Pill></div><i>→</i><div><b>02</b><span>后台代理提交</span><Pill>无需跳转</Pill></div><i>→</i><div><b>03</b><span>平台同步判题</span><Pill>统一记录</Pill></div></div>
    </section>
    <section className="install-grid">
      <article className="panel"><span className="micro-label">INSTALL</span><h2>安装方法</h2><ol><li>下载并解压扩展包。</li><li>打开 Chrome 的 <code>chrome://extensions</code> 或 Edge 的 <code>edge://extensions</code>。</li><li>开启「开发者模式」，选择「加载已解压的扩展程序」。</li><li>选择解压后的 <code>icpc-trainer-extension</code> 文件夹。</li></ol></article>
      <article className="panel"><span className="micro-label">SECURITY BOUNDARY</span><h2>安全边界</h2><ul><li>只有你点击站内“直接提交”后才会执行。</li><li>代码在浏览器内交给评测站，平台不保存代码全文。</li><li>密码、Cookie、API Key 始终留在浏览器，不上传服务器。</li><li>未登录或遇到验证时会停止，并打开评测页让你处理。</li></ul></article>
    </section>
  </AppShell>;
}
