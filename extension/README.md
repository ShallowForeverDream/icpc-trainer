# icpc-trainer Browser Bridge

Manifest V3 browser extension for Chrome and Edge.

On the first visit to a Codeforces problem it reads the public statement and
returns it to icpc-trainer for sanitized caching. For submissions it supports
both Codeforces and Universal Cup / QOJ: icpc-trainer sends the selected source
file, problem, and language, then the extension opens the matching official
page and fills its form.

It never clicks the final submit button. The user must check the problem,
language, and source before submitting on the official judge.

The extension never reads or uploads passwords, cookies, or API secrets.
