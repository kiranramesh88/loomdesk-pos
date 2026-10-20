#!/bin/sh
# Run a command as the unprivileged `loomdesk` user, e.g. in the host's shell:
#   sh /app/deploy/as_app.sh python manage.py load_demo_catalogue
# so files it writes to the media disk belong to the server's user. Already unprivileged: runs it as is.
set -eu
if [ "$(id -u)" != 0 ]; then
  exec "$@"
fi
exec python -c '
import os, pwd, sys
user = pwd.getpwnam("loomdesk")
os.setgroups([])
os.setgid(user.pw_gid)
os.setuid(user.pw_uid)
os.environ["HOME"] = user.pw_dir
os.execvp(sys.argv[1], sys.argv[1:])
' "$@"
