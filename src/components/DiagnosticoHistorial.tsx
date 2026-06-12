import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AlertCircle, CheckCircle, Database, RefreshCw } from 'lucide-react';

interface DiagnosticoResult {
  tablaExiste: boolean;
  columnas: any[];
  totalRegistros: number;
  ultimosRegistros: any[];
  error: string | null;
}

export function DiagnosticoHistorial() {
  const [resultado, setResultado] = useState<DiagnosticoResult | null>(null);
  const [cargando, setCargando] = useState(false);

  const ejecutarDiagnostico = async () => {
    setCargando(true);
    setResultado(null);

    try {
      // 1. Verificar si la tabla existe
      const { data: tablaData, error: tablaError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', 'image_analyses')
        .single();

      const tablaExiste = !!tablaData && !tablaError;

      // 2. Verificar columnas
      const { data: columnasData, error: columnasError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable')
        .eq('table_name', 'image_analyses')
        .order('ordinal_position');

      // 3. Contar registros
      const { count, error: countError } = await supabase
        .from('image_analyses')
        .select('*', { count: 'exact', head: true });

      // 4. Obtener últimos registros
      const { data: registrosData, error: registrosError } = await supabase
        .from('image_analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      setResultado({
        tablaExiste,
        columnas: columnasData || [],
        totalRegistros: count || 0,
        ultimosRegistros: registrosData || [],
        error: tablaError?.message || columnasError?.message || countError?.message || registrosError?.message || null
      });

    } catch (err) {
      setResultado({
        tablaExiste: false,
        columnas: [],
        totalRegistros: 0,
        ultimosRegistros: [],
        error: err instanceof Error ? err.message : 'Error desconocido'
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-text">Diagnóstico del Historial</h2>
        </div>
        <button
          onClick={ejecutarDiagnostico}
          disabled={cargando}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
          {cargando ? 'Ejecutando...' : 'Ejecutar Diagnóstico'}
        </button>
      </div>

      {resultado && (
        <div className="space-y-4">
          {/* Estado de la tabla */}
          <div className="flex items-center gap-2">
            {resultado.tablaExiste ? (
              <>
                <CheckCircle className="w-5 h-5 text-success" />
                <span className="text-success">Tabla 'image_analyses' existe</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-error" />
                <span className="text-error">Tabla 'image_analyses' NO existe</span>
              </>
            )}
          </div>

          {/* Total de registros */}
          <div className="bg-background rounded-lg p-4">
            <p className="text-sm text-text-muted">
              Total de registros en el historial: 
              <span className="text-text font-semibold ml-1">{resultado.totalRegistros}</span>
            </p>
          </div>

          {/* Columnas */}
          {resultado.columnas.length > 0 && (
            <div className="bg-background rounded-lg p-4">
              <h3 className="text-sm font-medium text-text mb-2">Columnas de la tabla:</h3>
              <div className="grid grid-cols-3 gap-2">
                {resultado.columnas.map((col: any) => (
                  <div key={col.column_name} className="text-xs bg-surface p-2 rounded">
                    <span className="font-medium">{col.column_name}</span>
                    <span className="text-text-muted ml-1">({col.data_type})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Últimos registros */}
          {resultado.ultimosRegistros.length > 0 && (
            <div className="bg-background rounded-lg p-4">
              <h3 className="text-sm font-medium text-text mb-2">Últimos registros:</h3>
              <div className="space-y-2">
                {resultado.ultimosRegistros.map((reg: any, idx: number) => (
                  <div key={idx} className="text-xs bg-surface p-2 rounded">
                    <p><span className="font-medium">ID:</span> {reg.id}</p>
                    <p><span className="font-medium">Descripción:</span> {reg.description?.substring(0, 50)}...</p>
                    <p><span className="font-medium">Fecha:</span> {reg.created_at ? new Date(reg.created_at).toLocaleString() : 'N/A'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {resultado.error && (
            <div className="bg-error/10 border border-error/20 text-error rounded-lg p-4">
              <p className="font-medium">Error:</p>
              <p className="text-sm mt-1">{resultado.error}</p>
            </div>
          )}

          {/* Sin registros */}
          {resultado.tablaExiste && resultado.totalRegistros === 0 && (
            <div className="bg-warning/10 border border-warning/20 text-warning rounded-lg p-4">
              <p className="font-medium">La tabla existe pero no tiene registros</p>
              <p className="text-sm mt-1">Sube algunas imágenes para crear registros en el historial.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}