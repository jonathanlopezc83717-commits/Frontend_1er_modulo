"""Valida el fix de _seleccionar_puntos: auto-selecciona y clic,
verifica que retorna la seleccion sin TclError tras destroy()."""
import os
import tkinter as tk

RAIZ_DIR = r"C:\Users\YOGA-01\Documents\Carpeta Raiz"
subdirs = sorted(d for d in os.listdir(RAIZ_DIR)
                 if os.path.isdir(os.path.join(RAIZ_DIR, d)) and not d.startswith("."))

root = tk.Tk(); root.withdraw()
top = tk.Toplevel(root)
lb = tk.Listbox(top, selectmode="multiple", width=40)
for d in subdirs:
    lb.insert("end", d)
lb.pack()
ok = {"v": False, "sel": []}

def _ok():
    ok["sel"] = [os.path.join(RAIZ_DIR, subdirs[i]) for i in lb.curselection()]
    ok["v"] = True
    top.destroy()

tk.Button(top, text="ok", command=_ok).pack()

def auto():
    lb.selection_set(0)  # seleccionar primer item
    _ok()
top.after(300, auto)
top.grab_set()
top.wait_window(top)
root.destroy()

print("ok.v:", ok["v"])
print("ok.sel:", ok["sel"])
print("OK: patron capturar-antes-de-destruir funciona." if ok["v"] and ok["sel"] else "FAIL")
