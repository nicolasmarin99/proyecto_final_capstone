# Fotos de demostración

`npm run seed:demo --workspace=@localcl/api` sube las fotos de esta carpeta a
los servicios de demostración. El nombre decide a qué servicio va cada foto:

| Prefijo          | Servicio                               |
|------------------|----------------------------------------|
| `gasfiteria-`    | Gasfitería a domicilio                 |
| `calefont-`      | Mantención e instalación de calefont   |
| `electricidad-`  | Instalación de enchufes y luminarias   |
| `carpinteria-`   | Muebles de cocina a medida             |
| `banqueteria-`   | Cóctel para eventos y cumpleaños       |
| `pintura-`       | Pintura de departamentos y casas       |
| `soldadura-`     | Rejas y portones de fierro             |

Por ejemplo `gasfiteria-1.jpg`, `gasfiteria-2.webp`. Se suben en orden
alfabético (la primera es la portada) y como máximo 5 por servicio.

- Formatos: JPG, PNG o WEBP, de hasta 5 MB.
- Los metadatos (EXIF, GPS) se quitan antes de guardarlas, igual que en la web.
- Usa fotos propias o con una licencia que permita usarlas, y sin personas,
  fachadas ni patentes reconocibles.

Los servicios sin fotos se muestran igual, con un marcador neutro.
