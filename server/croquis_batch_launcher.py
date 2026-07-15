"""Launcher batch robusto: pickers Tkinter -> destruir Tk -> COM sin GUI.

Evita el cuelgue de arrancar AutoCAD en frio dentro del mainloop de Tkinter
(que ademas oculta el progreso: el cmd se veia negro). Aqui los pickers se
cierran antes de tocar COM, y el progreso se imprime al cmd (visible siempre).

Reutiliza conectar_autocad / capturar_croquis / _leer_puntos / _elegir_puntos
de croquis_com.py (sin duplicar logica).

Uso:
  python croquis_batch_launcher.py            # pickers manuales
"""
import importlib.util
import os
import pathlib
import sys
import time

_RAIZ = pathlib.Path(__file__).resolve().parent.parent
_SCRIPT = _RAIZ / "server" / "croquis_com.py"
_spec = importlib.util.spec_from_file_location("croquis_com", _SCRIPT)
cc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cc)

conectar_autocad = cc.conectar_autocad
capturar_croquis = cc.capturar_croquis
_anadir_support_path = cc._anadir_support_path
_leer_puntos = cc._leer_puntos
_fmt_dur = cc._fmt_dur


def _seleccionar_puntos(parent, raiz):
    """Multi-seleccion de subcarpetas como Toplevel sobre el root unico.
    Evita crear un segundo tk.Tk() (antipatron que cuelga el mainloop).
    Devuelve lista de rutas o [] si se cancela."""
    import tkinter as tk

    subdirs = sorted(
        d for d in os.listdir(raiz)
        if os.path.isdir(os.path.join(raiz, d)) and not d.startswith("."))
    if not subdirs:
        return []
    top = tk.Toplevel(parent)
    top.title("3/3 Selecciona carpeta(s) de punto")
    top.attributes("-topmost", True)
    tk.Label(top, text=f"Subcarpetas de:\n{raiz}").pack(anchor="w", padx=8, pady=4)
    lb = tk.Listbox(top, selectmode="multiple", width=64, height=min(24, len(subdirs)))
    for d in subdirs:
        lb.insert("end", d)
    lb.pack(fill="x", padx=8)
    ok = {"v": False}

    def _ok():
        ok["v"] = True
        top.destroy()

    bb = tk.Frame(top)
    bb.pack(pady=6)
    tk.Button(bb, text="Cancelar", command=top.destroy).pack(side="left", padx=4)
    tk.Button(bb, text="Generar croquis", command=_ok).pack(side="left", padx=4)
    top.grab_set()
    top.wait_window(top)
    if not ok["v"]:
        return []
    return [os.path.join(raiz, subdirs[i]) for i in lb.curselection()]


def _pickers():
    """Pickers Tkinter. Devuelve (dwg, refs, puntos, n_por_sub, output_dir) o None.
    Usa UN SOLO root + Toplevel (crear dos tk.Tk() cuelga el mainloop).
    Destruye el root antes de retornar (COM va despues, sin GUI viva)."""
    import tkinter as tk
    from tkinter import filedialog, messagebox, simpledialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)

    raiz = filedialog.askdirectory(
        title="1/3 Carpeta RAIZ (con el DWG + subcarpetas de puntos)", parent=root)
    if not raiz:
        root.destroy()
        return None

    dwgs = sorted(f for f in os.listdir(raiz) if f.lower().endswith(".dwg"))
    if not dwgs:
        messagebox.showerror("Error", f"No hay archivo .dwg en:\n{raiz}", parent=root)
        root.destroy()
        return None
    if len(dwgs) == 1:
        dwg = os.path.join(raiz, dwgs[0])
    else:
        dwg = filedialog.askopenfilename(
            title="2/3 Elige el DWG a procesar", initialdir=raiz,
            filetypes=[("DWG", "*.dwg")], parent=root)
        if not dwg:
            root.destroy()
            return None

    refs = os.path.join(raiz, "Ortomosaico")
    if not os.path.isdir(refs):
        refs = None

    puntos = _seleccionar_puntos(root, raiz)
    if not puntos:
        root.destroy()
        return None

    n_por_sub = simpledialog.askinteger(
        "Puntos por subcarpeta",
        "Cuantos puntos procesar por subcarpeta?\n(0 = todos los del CSV/xlsx)",
        initialvalue=1, minvalue=0, maxvalue=1000, parent=root)
    if n_por_sub is None:
        root.destroy()
        return None

    salida = filedialog.askdirectory(
        title="Carpeta de SALIDA (Cancelar = junto a cada subcarpeta)",
        initialdir=raiz, parent=root)
    root.destroy()  # CERRAR Tk antes de COM
    return dwg, refs, puntos, n_por_sub, (salida or None)


def main():
    cc.pythoncom.CoInitialize()
    sel = _pickers()
    if not sel:
        return 0
    dwg, refs, puntos, n_por_sub, output_dir = sel

    plan = []
    for pp in puntos:
        plan.append((os.path.basename(pp), _leer_puntos(pp, n_por_sub), pp))
    total = sum(len(pts) for _, pts, _ in plan)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    os.environ["CROQUIS_KEEP_OPEN"] = "1"  # dejar el DWG abierto tras capturar

    print(f"\n[batch] {total} punto(s) en {len(plan)} subcarpeta(s).", flush=True)
    print(f"[batch] DWG: {dwg}", flush=True)
    print(f"[batch] refs: {refs or '(ninguna)'}", flush=True)
    print(f"[batch] salida: {output_dir or '(junto a cada subcarpeta)'}", flush=True)
    print("[batch] Conectando a AutoCAD (arranque en frio si hace falta)...", flush=True)

    t0 = time.time()
    hechos = 0
    try:
        acad = conectar_autocad()
        visibles = cc._ventanas_autocad_visibles()
        if len(visibles) > 1:
            print(f"\n[batch] ADVERTENCIA: hay {len(visibles)} ventanas de AutoCAD abiertas:", flush=True)
            for h, t in visibles:
                print(f"          - {t}", flush=True)
            print("[batch] La captura usara la instancia conectada por COM.", flush=True)
            print("[batch] Cierra las demas si la captura sale de la ventana equivocada.", flush=True)
        elif not visibles:
            print("\n[batch] ADVERTENCIA: no se detecto ventana visible de AutoCAD.", flush=True)
        else:
            print(f"[batch] Ventana de AutoCAD: {visibles[0][1]}", flush=True)
        if os.environ.get("CROQUIS_CONFIRMAR_VENTANA"):
            print("[batch] Modo confirmacion activo: pausara antes de cada captura.", flush=True)
        if refs:
            _anadir_support_path(acad, refs)
        for nombre, pts, pp in plan:
            if not pts:
                print(f"[skip] {nombre}: sin puntos validos en CSV/xlsx", flush=True)
                continue
            for (x, y, label) in pts:
                out = (os.path.join(output_dir, f"{nombre}_{label}.png")
                       if output_dir else os.path.join(pp, f"{nombre}_{label}.png"))
                print(f"\n[{hechos+1}/{total}] {nombre} {label}  centro=({x}, {y})", flush=True)
                print(f"       -> {out}", flush=True)
                try:
                    o, kb = capturar_croquis(dwg, x, y, out, acad=acad, refs_folder=refs)
                    print(f"  OK: {kb} KB", flush=True)
                    hechos += 1
                except Exception as e:
                    print(f"  FAIL: {e}", flush=True)
                if hechos > 0:
                    avg = (time.time() - t0) / hechos
                    restante = avg * (total - hechos)
                    print(f"  (restante aprox.: {_fmt_dur(restante)})", flush=True)
    except Exception as e:
        print(f"\n[ERROR FATAL] {e}", flush=True)
        import traceback
        traceback.print_exc()

    dur = time.time() - t0
    print(f"\n==== RESUMEN: {hechos}/{total} capturas OK en {_fmt_dur(dur)} ====", flush=True)
    salida_final = output_dir or (puntos[0] if puntos else "")
    if salida_final and os.path.isdir(salida_final):
        try:
            os.startfile(salida_final)
            print(f"Carpeta de salida abierta: {salida_final}", flush=True)
        except Exception as e:
            print(f"(no se pudo abrir la carpeta: {e})", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n[interrumpido por el usuario]", flush=True)
        sys.exit(130)
