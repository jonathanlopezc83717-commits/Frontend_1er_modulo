-- Foreign key: coordenadas_gps -> puntos_ferroviarios
ALTER TABLE coordenadas_gps
ADD CONSTRAINT fk_coordenadas_punto
FOREIGN KEY (punto_id) REFERENCES puntos_ferroviarios(id);

-- Foreign key: documentos_punto -> puntos_ferroviarios
ALTER TABLE documentos_punto
ADD CONSTRAINT fk_documentos_punto
FOREIGN KEY (punto_id) REFERENCES puntos_ferroviarios(id);

-- Foreign key: analisis_imagenes -> puntos_ferroviarios
ALTER TABLE analisis_imagenes
ADD CONSTRAINT fk_analisis_punto
FOREIGN KEY (punto_id) REFERENCES puntos_ferroviarios(id);

-- Foreign key: fotos_punto -> puntos_ferroviarios
ALTER TABLE fotos_punto
ADD CONSTRAINT fk_fotos_punto
FOREIGN KEY (punto_id) REFERENCES puntos_ferroviarios(id);

-- Foreign key: historial_obras -> puntos_ferroviarios
ALTER TABLE historial_obras
ADD CONSTRAINT fk_historial_punto
FOREIGN KEY (punto_id) REFERENCES puntos_ferroviarios(id);