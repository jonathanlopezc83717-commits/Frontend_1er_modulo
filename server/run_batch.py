"""Entry point del .exe del batch de croquis.

Lanza directamente el GUI batch (_batch_gui) de croquis_com: picker de carpeta
raiz -> DWG -> multi-seleccion de carpetas de punto -> captura PNG por cada una.
No pasa por main()/argv porque el .exe se invoca por doble-click.
"""
import sys

import pythoncom

import croquis_com

if __name__ == "__main__":
    pythoncom.CoInitialize()
    sys.exit(croquis_com._batch_gui())
