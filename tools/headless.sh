#!/bin/sh
# Carga index.html en Chrome headless y vuelca el DOM; falla si hay errores JS.
D=$(dirname "$0")/..
google-chrome --headless=new --no-sandbox --disable-gpu --enable-logging=stderr --v=0 --virtual-time-budget=3000 --dump-dom "file://$(realpath $D)/index.html" > /tmp/tdd_dom.html 2>/tmp/tdd_err.txt
grep -i "Uncaught\|SyntaxError\|ReferenceError\|TypeError" /tmp/tdd_err.txt && exit 1
grep -o '<h2>[^<]*</h2>' /tmp/tdd_dom.html && grep -c 'class="opt"' /tmp/tdd_dom.html && grep -o 'Próximo término[^<]*' /tmp/tdd_dom.html
