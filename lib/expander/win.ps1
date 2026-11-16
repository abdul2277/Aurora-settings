# Aurora text expander helper (Windows). Prints one short code per key to stdout, nothing else, and writes nothing to disk:
#   C<char> typed character   B backspace   R reset (Enter, Tab, Ctrl/Alt/Win combos, mouse click)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Diagnostics; using System.Windows.Forms;
public static class AuroraKeys {
  delegate IntPtr Proc(int n, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc p, IntPtr m, uint t);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int n, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
  [DllImport("user32.dll")] static extern int ToUnicodeEx(uint vk, uint sc, byte[] ks, [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder b, int cch, uint fl, IntPtr hkl);
  [DllImport("user32.dll")] static extern bool GetKeyboardState(byte[] ks);
  [DllImport("user32.dll")] static extern short GetKeyState(int vk);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint t);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  static Proc kp = KeyCb, mp = MouseCb; static IntPtr h1, h2;
  static void Out(string s) { Console.Out.WriteLine(s); Console.Out.Flush(); }
  static IntPtr KeyCb(int n, IntPtr w, IntPtr l) {
    if (n >= 0 && (w == (IntPtr)0x100 || w == (IntPtr)0x104)) {
      int vk = Marshal.ReadInt32(l); int sc = Marshal.ReadInt32(l, 4); int fl = Marshal.ReadInt32(l, 8);
      if ((fl & 0x10) != 0) return CallNextHookEx(h1, n, w, l); // key we injected ourselves
      if (vk == 0x10 || vk == 0xA0 || vk == 0xA1 || vk == 0x11 || vk == 0xA2 || vk == 0xA3 || vk == 0x12 || vk == 0xA4 || vk == 0xA5 || vk == 0x14) return CallNextHookEx(h1, n, w, l);
      bool ctrl = (GetKeyState(0x11) & 0x8000) != 0, alt = (GetKeyState(0x12) & 0x8000) != 0, win = (GetKeyState(0x5B) & 0x8000) != 0 || (GetKeyState(0x5C) & 0x8000) != 0;
      bool altgr = ctrl && alt && (GetKeyState(0xA5) & 0x8000) != 0;
      if (vk == 0x08) Out("B");
      else if ((ctrl && !altgr) || (alt && !altgr) || win || vk == 0x0D || vk == 0x09 || vk == 0x1B || (vk >= 0x21 && vk <= 0x2F && vk != 0x20) || (vk >= 0x70 && vk <= 0x87)) Out("R");
      else {
        byte[] ks = new byte[256]; GetKeyboardState(ks);
        uint pid; uint tid = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
        StringBuilder sb = new StringBuilder(8); int r = ToUnicodeEx((uint)vk, (uint)sc, ks, sb, 8, 4, GetKeyboardLayout(tid));
        if (r == 1 && sb[0] >= ' ') Out("C" + sb[0]); else Out("R");
      }
    }
    return CallNextHookEx(h1, n, w, l);
  }
  static IntPtr MouseCb(int n, IntPtr w, IntPtr l) { if (n >= 0 && (w == (IntPtr)0x201 || w == (IntPtr)0x204 || w == (IntPtr)0x207)) Out("R"); return CallNextHookEx(h2, n, w, l); }
  public static void Run() {
    IntPtr m = GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName);
    h1 = SetWindowsHookEx(13, kp, m, 0); h2 = SetWindowsHookEx(14, mp, m, 0);
    if (h1 == IntPtr.Zero) { Console.Error.WriteLine("hook failed"); return; }
    Out("READY"); Application.Run();
  }
}
"@ -ReferencedAssemblies System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[AuroraKeys]::Run()
