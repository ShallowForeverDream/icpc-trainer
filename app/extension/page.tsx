import { AppShell, Icon, Pill } from "../components/AppShell";

export default function ExtensionPage() {
  return <AppShell active="提交扩展">
    <section className="extension-hero">
      <div><span className="eyebrow"><span className="live-dot" /> CHROME / EDGE · MANIFEST V3</span><h1>从训练台，<br /><em>一步带到 Codeforces。</em></h1><p>扩展接收当前题号和 C++20 源码，打开 Codeforces 提交页并自动预填。题目页可为单次提交额外开启「自动点击提交」。</p><div className="hero-actions"><a className="button button-primary" href="/icpc-trainer-extension.zip" download><Icon name="spark" /> 下载扩展包 v0.2</a><a className="button button-ghost" href="https://codeforces.com/problemset/submit" target="_blank" rel="noreferrer">打开 Codeforces ↗</a></div></div>
      <div className="extension-flow"><div><b>01</b><span>在题目页写代码</span><Pill>icpc-trainer</Pill></div><i>→</i><div><b>02</b><span>选择预填或自动提交</span><Pill>单次授权</Pill></div><i>→</i><div><b>03</b><span>Codeforces 执行提交</span><Pill>官方页面</Pill></div></div>
    </section>
    <section className="install-grid">
      <article className="panel"><span className="micro-label">INSTALL</span><h2>安装方法</h2><ol><li>下载并解压扩展包。</li><li>打开 Chrome 的 <code>chrome://extensions</code> 或 Edge 的 <code>edge://extensions</code>。</li><li>开启「开发者模式」，选择「加载已解压的扩展程序」。</li><li>选择解压后的 <code>icpc-trainer-extension</code> 文件夹。</li></ol></article>
      <article className="panel"><span className="micro-label">SECURITY BOUNDARY</span><h2>扩展会做什么</h2><ul><li>只接收题号、语言、源码和本次自动提交开关。</li><li>只访问 <code>*.chatgpt.site</code>、本地开发地址与 <code>codeforces.com</code>。</li><li>不读取 Codeforces 密码、Cookie 或 API Secret。</li><li>只有你在题目页勾选时才自动点击提交。</li></ul></article>
    </section>
  </AppShell>;
}
