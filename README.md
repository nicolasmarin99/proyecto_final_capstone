# LocalCL

> Plataforma web y móvil para la búsqueda de servicios, con perfiles verificados, certificaciones y valoraciones de los prestadores.

![Estado](https://img.shields.io/badge/estado-en%20desarrollo-yellow)
![Licencia](https://img.shields.io/badge/licencia-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-20-339933)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1)

Proyecto de Título — Ingeniería en Informática, Duoc UC — 2026

---

## Tabla de contenidos

- [Descripción](#descripción)
- [Tecnologías](#tecnologías)
- [Arquitectura](#arquitectura)
- [Instrucciones de instalación](#instrucciones-de-instalación)
- [Metodología de trabajo](#metodología-de-trabajo)
- [Integrantes y roles](#integrantes-y-roles)

---

## Descripción

LoclaCL es una plataforma que conecta a personas que necesitan un servicio con quienes lo ofrecen, retomando la lógica de la recordada guias amarillas pero especializada en servicios y enriquecida con información verificable del prestador.

A diferencia de un listado de contactos tradicional, cada prestador cuenta con un perfil que reúne su oferta de servicios, documentación que acredita su idoneidad y las valoraciones dejadas por clientes anteriores. El objetivo es reducir la incertidumbre del usuario al momento de contratar.

### Problema que resuelve

Actualmente la búsqueda de un prestador de servicios se apoya en recomendaciones informales o en publicaciones dispersas en redes sociales, sin ninguna forma de verificar la experiencia ni las credenciales de quien ofrece el servicio. Esto genera desconfianza en el cliente y dificulta la visibilidad de prestadores que sí cuentan con respaldo formal.

### Funcionalidades principales

- Búsqueda de servicios por texto libre, categoría y cercanía geográfica.
- Perfil público del prestador con descripción, servicios ofrecidos y datos de contacto.
- Carga y validación de certificados y documentos acreditativos.
- Sistema de valoraciones y comentarios de clientes.
- Panel de administración para moderación de contenido y validación de credenciales.
- Autenticación con tres perfiles diferenciados: cliente, prestador y administrador.

### Estado del proyecto

En desarrollo. Consulta nuestro github(https://github.com/nicolasmarin99/proyecto_final_capstone/tree/main) para ver el avance por sprint.

---

## Tecnologías

| Capa | Tecnología | Uso |
|---|---|---|
| Lenguaje | TypeScript | Lenguaje único en las tres capas del sistema |
| Frontend web | React 19 + Vite + Tailwind CSS | Sitio web y panel de administración |
| Aplicación móvil | React Native (Expo) | Aplicación para Android e iOS |
| Backend | Node.js + Express | API REST y reglas de negocio |
| ORM | Prisma | Acceso tipado a datos y migraciones |
| Base de datos | PostgreSQL 16 | Persistencia, búsqueda de texto completo y consultas geoespaciales |
| Archivos | Cloudinary | Almacenamiento de certificados e imágenes |
| Autenticación | JWT + bcrypt | Sesiones y resguardo de contraseñas |
| Infraestructura | Vercel · Render · Neon · Expo EAS | Despliegue de cada componente |
| Apoyo | Docker · Postman · GitHub Actions | Entorno local, pruebas de API e integración continua |

### Por qué este stack

La decisión central fue utilizar un solo lenguaje en todas las capas. React, React Native y Node.js comparten TypeScript, lo que permite reutilizar conocimiento y definiciones de tipos entre el cliente web, el cliente móvil y el servidor, en lugar de mantener tres tecnologías distintas con un equipo de dos personas.

**PostgreSQL** se eligió porque el modelo de datos es altamente relacional (un prestador tiene servicios, cada servicio tiene valoraciones) y porque su búsqueda de texto completo en español y la extensión PostGIS resuelven de forma nativa la funcionalidad principal del sistema, sin requerir un motor de búsqueda adicional.

---

## Arquitectura

El sistema sigue una arquitectura cliente–servidor de tres capas. Los clientes no acceden nunca a la base de datos de forma directa: toda operación pasa por la API, donde residen las reglas de negocio y la verificación de permisos.

```mermaid
graph TD
    A[Cliente Web<br/>React + Vite] -->|HTTPS / REST| C[API REST<br/>Node.js + Express]
    B[Cliente Móvil<br/>React Native] -->|HTTPS / REST| C
    C --> D[Capa de servicios<br/>Reglas de negocio]
    D --> E[Prisma ORM]
    E --> F[(PostgreSQL)]
    D --> G[Cloudinary<br/>Certificados e imágenes]
    C --> H[Autenticación JWT<br/>Control de acceso por rol]
```



## Instrucciones de instalación

### Requisitos previos

| Herramienta | Versión mínima | Verificar con |
|---|---|---|
| Node.js | 20.x | `node -v` |
| npm | 10.x | `npm -v` |
| Docker Desktop | — | `docker -v` |
| Git | — | `git --version` |
| Expo Go (móvil) | — | App instalada en el teléfono |

### 1. Clonar el repositorio

```bash
git clone https://github.com/[usuario]/[repositorio].git
cd [repositorio]
npm install
```

### 2. Levantar la base de datos

```bash
docker compose up -d
```

Esto inicia PostgreSQL en el puerto `5432`. Verifica que el contenedor esté corriendo con `docker ps`.

### 3. Configurar variables de entorno

Copia el archivo de ejemplo y completa los valores:

```bash
cp apps/api/.env.example apps/api/.env
```

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/[nombre_bd]"
JWT_SECRET="cadena_larga_y_aleatoria"
JWT_EXPIRES_IN="7d"
PORT=3000
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
```

> El archivo `.env` está excluido del repositorio mediante `.gitignore`. Nunca subas credenciales reales a GitHub.

### 4. Preparar el esquema y los datos de prueba

```bash
cd apps/api
npx prisma migrate dev      # Crea las tablas
npx prisma db seed          # Carga datos de prueba
npx prisma studio           # (Opcional) Explorador visual de la BD
```

### 5. Ejecutar los componentes

Cada uno en una terminal distinta:

```bash
# Backend  → http://localhost:3000
npm run dev --workspace=api

# Web      → http://localhost:5173
npm run dev --workspace=web

# Móvil    → escanear el código QR con Expo Go
npm run start --workspace=mobile
```


### Comandos útiles

```bash
npm run lint          # Análisis estático de código
npm run test          # Ejecutar pruebas
npx prisma migrate reset   # Reiniciar la base de datos desde cero
```

---

## Metodología de trabajo

El proyecto se desarrolla bajo un marco Scrum adaptado al contexto académico, con sprints de dos semanas alineados a las entregas de la asignatura.

### Ceremonias

| Ceremonia | Frecuencia | Propósito |
|---|---|---|
| Planificación de sprint | Inicio de cada sprint | Selección y estimación de historias de usuario |
| Reunión de sincronización | 2 veces por semana | Avance, bloqueos y coordinación |
| Revisión de sprint | Cierre de sprint | Demostración del incremento funcional |
| Retrospectiva | Cierre de sprint | Mejoras al proceso de trabajo |

### Gestión de tareas

El seguimiento se realiza mediante nuestro repositorio de GitHub, con las tareas descritas como historias de usuario y criterios de aceptación explícitos. Cada tarea se vincula a un requisito funcional numerado (`RF-01`, `RF-02`, …), lo que permite trazar cada línea de código hasta el requisito que la origina.

Flujo de estados: `Backlog → To Do → In Progress → In Review → Done`


## Integrantes y roles

| Integrante | Rol | Responsabilidades | GitHub |
|---|---|---|---|
| nicolas marin | responsable del proyecto | [Responsabilidades principales] | [
| martin nuñez | QA  | [Responsabilidades principales] |

**Docente guía:** marcela gonzalez
**Carrera:** Ingeniería en Informática — Duoc UC
**Período:** octavo semestre año 2026


