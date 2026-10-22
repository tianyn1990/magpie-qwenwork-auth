#!/bin/sh
qw_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
/bin/sh "$qw_dir/install.sh"
qw_result=$?
if [ -t 0 ]; then printf '\nPress Enter to close. '; read -r qw_enter; fi
exit "$qw_result"
