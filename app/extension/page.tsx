import { AppShell, Icon, Pill } from "../components/AppShell";

export default function ExtensionPage() {
  return <AppShell active="提交扩展">
    <section className="extension-hero">
      <div><span className="eyebrow"><span className="live-dot" /> CHROME / EDGE · MANIFEST V3</span><h1>选择代码文件，<br /><em>直接预填官方提交页。</em></h1><p>支持 Codeforces、Codeforces Gym 与 Universal Cup / QOJ。题目、语言和代码会自动填入，最终提交始终由你确认。</p><div className="hero-actions"><a className="button button-primary" href="/icpc-trainer-extension.zip" download><Icon name="spark" /> 下载扩展包 v0.6</a><a className="button button-ghost" href="https://contest.ucup.ac/" target="_blank" rel="noreferrer">打开 Universal Cup ↗</a></div></div>
      <div className="extension-flow"><div><b>01</b><span>选择本地代码文件</span><Pill>不设站内编辑器</Pill></div><i>→</i><div><b>02</b><span>选择题目与语言</span><Pill>自动识别</Pill></div><i>→</i><div><b>03</b><span>预填官方提交页</span><Pill>手动确认</Pill></div></div>
    </section>
    <section className="install-grid">
      <article className="panel"><span className="micro-label">INSTALL</span><h2>安装方法</h2><ol><li>下载并解压扩展包。</li><li>打开 Chrome 的 <code>chrome://extensions</code> 或 Edge 的 <code>edge://extensions</code>。</li><li>开启「开发者模式」，选择「加载已解压的扩展程序」。</li><li>选择解压后的 <code>icpc-trainer-extension</code> 文件夹。</li></ol></article>
      <article className="panel"><span className="micro-label">SECURITY BOUNDARY</span><h2>扩展会做什么</h2><ul><li>按题号读取公开的 Codeforces 原题，用于首次导入。</li><li>在 Codeforces、Universal Cup / QOJ 页面填入你主动选择的代码文件。</li><li>不读取或上传密码、Cookie、API Key。</li><li>只预填表单，不会点击最终提交按钮。</li></ul></article>
    </section>
  </AppShell>;
}
