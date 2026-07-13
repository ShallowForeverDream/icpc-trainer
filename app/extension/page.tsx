import { AppShell, Icon, Pill } from "../components/AppShell";

export default function ExtensionPage() {
  return <AppShell active="提交扩展">
    <section className="extension-hero">
      <div><span className="eyebrow"><span className="live-dot" /> CHROME / EDGE · MANIFEST V3</span><h1>原题导入与提交，<br /><em>都在一个扩展里。</em></h1><p>首次打开题目时，扩展读取 Codeforces 官方原题并交给训练台缓存，保留公式与图片；写完代码后还可打开官方提交页并自动预填。</p><div className="hero-actions"><a className="button button-primary" href="/icpc-trainer-extension.zip" download><Icon name="spark" /> 下载扩展包 v0.3</a><a className="button button-ghost" href="https://codeforces.com/problemset/submit" target="_blank" rel="noreferrer">打开 Codeforces ↗</a></div></div>
      <div className="extension-flow"><div><b>01</b><span>首次打开读取公开原题</span><Pill>安全缓存</Pill></div><i>→</i><div><b>02</b><span>原文 / 中文随时切换</span><Pill>图片可见</Pill></div><i>→</i><div><b>03</b><span>写完后预填官方提交</span><Pill>Codeforces</Pill></div></div>
    </section>
    <section className="install-grid">
      <article className="panel"><span className="micro-label">INSTALL</span><h2>安装方法</h2><ol><li>下载并解压扩展包。</li><li>打开 Chrome 的 <code>chrome://extensions</code> 或 Edge 的 <code>edge://extensions</code>。</li><li>开启「开发者模式」，选择「加载已解压的扩展程序」。</li><li>选择解压后的 <code>icpc-trainer-extension</code> 文件夹。</li></ol></article>
      <article className="panel"><span className="micro-label">SECURITY BOUNDARY</span><h2>扩展会做什么</h2><ul><li>按题号读取公开的 Codeforces 原题 HTML，用于首次导入和图片地址解析。</li><li>只访问 <code>*.chatgpt.site</code>、本地开发地址与 <code>codeforces.com</code>。</li><li>不读取或上传 Codeforces 密码、Cookie、API Key；题面缓存不包含登录信息。</li><li>只有你在题目页勾选时才会自动点击提交。</li></ul></article>
    </section>
  </AppShell>;
}
