#!/usr/bin/env python3
# Vorynth text expander helper (Linux/X11). Watches typed characters and prints ONE short code per key to stdout:
#   C<char>  a typed character     B  backspace     R  anything that should reset (Enter, Tab, Ctrl/Alt/Super combos, mouse click)
# It never writes anything to disk and never prints more than that. Vorynth keeps only the last few characters in memory.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
from Xlib import X, XK, display
from Xlib.ext import record
from Xlib.protocol import rq

d = display.Display()
rd = display.Display()
if not d.has_extension('RECORD'):
    sys.stderr.write('no RECORD extension\n'); sys.exit(2)
mods = {'shift': 0, 'ctrl': 0, 'alt': 0, 'super': 0}
MODKEYS = {'Shift_L': 'shift', 'Shift_R': 'shift', 'Control_L': 'ctrl', 'Control_R': 'ctrl', 'Alt_L': 'alt', 'Alt_R': 'alt', 'Meta_L': 'alt', 'Super_L': 'super', 'Super_R': 'super'}
altgr = 0

def out(s):
    sys.stdout.write(s + '\n'); sys.stdout.flush()

def handler(reply):
    global altgr
    if reply.category != record.FromServer or reply.client_swapped or not len(reply.data) or reply.data[0] < 2:
        return
    data = reply.data
    while len(data):
        ev, data = rq.EventField(None).parse_binary_value(data, rd.display, None, None)
        t = ev.type
        if t in (X.ButtonPress,):
            out('R'); continue
        if t not in (X.KeyPress, X.KeyRelease):
            continue
        kc = ev.detail
        ks = d.keycode_to_keysym(kc, 0)
        name = XK.keysym_to_string(ks) if ks else None
        nm = None
        for n in ('Shift_L', 'Shift_R', 'Control_L', 'Control_R', 'Alt_L', 'Alt_R', 'Meta_L', 'Super_L', 'Super_R', 'ISO_Level3_Shift'):
            if ks == XK.string_to_keysym(n): nm = n
        if nm:
            if nm == 'ISO_Level3_Shift': altgr = 1 if t == X.KeyPress else 0
            else: mods[MODKEYS[nm]] = 1 if t == X.KeyPress else 0
            continue
        if t == X.KeyRelease:
            continue
        if mods['ctrl'] or mods['alt'] or mods['super']:
            out('R'); continue
        # level: shift and AltGr; caps lock comes from the event state
        caps = bool(ev.state & X.LockMask)
        idx = (1 if mods['shift'] else 0) + (4 if altgr else 0)
        k = d.keycode_to_keysym(kc, idx) or d.keycode_to_keysym(kc, 0)
        if not mods['shift'] and caps and k:
            k2 = d.keycode_to_keysym(kc, 1)
            if k2 and 97 <= k <= 122: k = k2
        if k == XK.string_to_keysym('BackSpace'): out('B'); continue
        if k in (XK.string_to_keysym('Return'), XK.string_to_keysym('KP_Enter'), XK.string_to_keysym('Tab'), XK.string_to_keysym('Escape')) or (65360 <= k <= 65385 and k != 65288):
            out('R'); continue
        s = XK.keysym_to_string(k) if k else None
        if s is None and k and k < 0x110000 and k >= 0x20:
            try: s = chr(k) if k < 0xff00 else None
            except Exception: s = None
        if s and len(s) == 1 and ord(s) >= 32:
            out('C' + s)
        else:
            out('R')

ctx = rd.record_create_context(0, [record.AllClients], [{'core_requests': (0, 0), 'core_replies': (0, 0), 'ext_requests': (0, 0, 0, 0), 'ext_replies': (0, 0, 0, 0), 'delivered_events': (0, 0), 'device_events': (X.KeyPress, X.ButtonPress), 'errors': (0, 0), 'client_started': False, 'client_died': False}])
out('READY')
try:
    rd.record_enable_context(ctx, handler)
finally:
    rd.record_free_context(ctx)
