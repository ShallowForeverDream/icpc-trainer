# icpc-trainer Browser Bridge

Manifest V3 browser extension for Chrome and Edge.

On the first visit to a Codeforces problem it reads the public statement and
returns it to icpc-trainer for sanitized caching. For submissions it supports
both Codeforces and Universal Cup / QOJ. After an explicit click on the
icpc-trainer submit button, the extension opens the matching judge page in an
inactive tab, fills the problem, language and source, then submits the form.
Each request uses an isolated background tab, so Codeforces, Gym, and QOJ
submissions can be judged concurrently without overwriting one another. The
judge tab closes after a final verdict. Login or verification failures stop
the flow and surface only the affected judge tab for the user.

The extension never uploads passwords, cookies, API secrets, or source code to
the icpc-trainer server. Judge credentials stay in the browser session.
