# icpc-trainer Browser Bridge

Manifest V3 browser extension for Chrome and Edge.

On the first visit to a problem it reads the public Codeforces statement and
returns it to icpc-trainer for sanitized caching, including the original image
URLs. It also receives a draft from the editor, opens the official submission
page, and fills the problem, GNU C++20 language, and source code fields.

The extension never reads or uploads passwords, cookies, or API secrets.
