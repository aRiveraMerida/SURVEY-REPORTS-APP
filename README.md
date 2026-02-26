# Survey Reports App

Aplicacion web para generar informes profesionales a partir de datos de encuestas y campanas. Utiliza **inteligencia artificial (Claude de Anthropic)** para analizar automaticamente los datos cargados (Excel/CSV), detectar las preguntas relevantes y proponer la estructura del informe. El usuario puede personalizar las preguntas, tipos de grafico y filtros antes de generar el informe final en HTML.

## Caracteristicas principales

- **Analisis adaptativo con IA**: Claude analiza estadisticas de columnas para identificar el tipo de datos, detectar preguntas de encuesta, proponer embudos de clasificacion y sugerir tipos de grafico adecuados.
- **Tres tipos de informe**: graficos de barras/pastel (`charts`), tablas resumen (`table`) y diagramas de flujo (`flowchart`).
- **Portadas profesionales**: cada informe incluye portada con logotipos, periodo, barra decorativa y esquema de color corporativo (#53860F).
- **Filtrado por pregunta**: cada pregunta puede tener un `filterColumn`/`filterValues` para segmentar los datos antes de calcular resultados.
- **Autenticacion con Supabase**: Magic Link (sin contrasena). RLS habilitado en todas las tablas.
- **Gestion de clientes y emisor**: configuracion de empresa emisora (logo, contacto) y clientes (logo, nombre) almacenados en Supabase.
- **Exportacion multiple**: descarga de informes en HTML, exportacion de datos a Excel (.xlsx) con hojas de resumen y detalle por pregunta, e impresion directa a PDF.
- **Registro de accesos**: log automatico de accesos y acciones clave (login, creacion de informes, exportaciones, analisis IA) visible desde la propia aplicacion.

## Stack tecnologico

- **Framework**: [Next.js 16](https://nextjs.org/) con App Router y Turbopack
- **Lenguaje**: TypeScript
- **UI**: Tailwind CSS v4 con tema corporativo (verde `#53860F`)
- **Tipografia**: Inter (Google Fonts)
- **IA**: Anthropic Claude (`@anthropic-ai/sdk`)
- **Base de datos / Auth**: [Supabase](https://supabase.com/) (`@supabase/supabase-js`, `@supabase/ssr`)
- **Graficos**: Chart.js + react-chartjs-2
- **Parsing de datos**: PapaParse (CSV) + SheetJS/xlsx (Excel)
- **Drag & Drop**: dnd-kit (reordenacion de preguntas)
- **Hosting**: Vercel

## Estructura del proyecto

```
survey-reports-app/
├── app/
│   ├── layout.tsx                  # Layout raiz (fuente Inter, metadata)
│   ├── login/page.tsx              # Pagina de login (Magic Link)
│   ├── auth/callback/route.ts      # Callback de Supabase Auth
│   ├── api/analyze/route.ts        # API Route que invoca Claude
│   └── (app)/                      # Grupo de rutas autenticadas
│       ├── layout.tsx              # Layout con Navbar + AccessLogger
│       ├── page.tsx                # Dashboard principal
│       ├── access-logs/page.tsx    # Registro de accesos (logs)
│       ├── clients/[id]/page.tsx   # Detalle/edicion de cliente
│       ├── reports/new/page.tsx    # Asistente de creacion de informe (3 pasos)
│       ├── reports/[id]/page.tsx   # Vista previa del informe generado
│       └── settings/page.tsx       # Configuracion del emisor y API Key
├── components/
│   └── ui/
│       ├── Navbar.tsx              # Barra de navegacion
│       └── AccessLogger.tsx        # Registro automatico de accesos
├── lib/
│   ├── ai/prompts.ts               # Prompt del sistema para Claude
│   ├── db/
│   │   ├── clients.ts              # CRUD de clientes en Supabase
│   │   ├── emitter.ts              # CRUD de configuracion del emisor
│   │   ├── reports.ts              # CRUD de informes en Supabase
│   │   └── access-logs.ts          # Registro y consulta de logs de acceso
│   ├── processing/
│   │   ├── parser.ts               # Parseo de archivos Excel/CSV
│   │   ├── stats.ts                # buildColumnStats() — estadisticas por columna
│   │   ├── processor.ts            # Generacion de datos del informe
│   │   └── resolver.ts             # Resolucion de URLs de logo
│   ├── reports/
│   │   ├── charts-html.ts          # Plantilla HTML para informes de graficos
│   │   ├── table-html.ts           # Plantilla HTML para informes de tabla
│   │   ├── flowchart-html.ts       # Plantilla HTML para informes de flujo
│   │   ├── chart-renderer.ts       # Renderizado de graficos con Chart.js
│   │   └── excel-export.ts         # Exportacion de datos a Excel (.xlsx)
│   ├── supabase/
│   │   ├── client.ts               # Cliente Supabase para el navegador
│   │   ├── server.ts               # Cliente Supabase para Server Components
│   │   └── middleware.ts           # Helper de Supabase para middleware
│   └── utils/formatting.ts         # Utilidades de formato (numeros, colores)
├── types/
│   └── database.ts                 # Tipos TypeScript (AIAnalysis, AIQuestionConfig, etc.)
├── middleware.ts                    # Middleware de Next.js (proteccion de rutas)
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql         # Esquema inicial (emitter_settings, clients, reports, RLS)
│       ├── 002_simplify_for_ai.sql # Simplificacion: elimina client_configs, ai_analysis en reports
│       └── 003_access_logs.sql     # Tabla de registro de accesos
└── package.json
```

## Requisitos previos

- **Node.js** >= 18.x
- **npm** (incluido con Node.js)
- Cuenta en **Supabase** (plan gratuito suficiente)
- API Key de **Anthropic** (Claude) — se configura desde la UI, no requiere variable de entorno

## Instalacion y configuracion local

### 1. Clonar el repositorio

```bash
git clone git@github.com:aRiveraMerida/SURVEY-REPORTS-APP.git
cd SURVEY-REPORTS-APP
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Crear proyecto en Supabase

1. Ve a [app.supabase.com](https://app.supabase.com) y crea un nuevo proyecto.
2. Una vez creado, ve a **Settings > API** y copia:
   - `Project URL` (ej: `https://xxxx.supabase.co`)
   - `anon public` key

### 4. Ejecutar migraciones en Supabase

Ve al **SQL Editor** de tu proyecto en Supabase y ejecuta los siguientes archivos **en orden**:

1. `supabase/migrations/001_initial.sql` — Crea las tablas `emitter_settings`, `clients`, `reports`, habilita RLS, crea el bucket de logos y las politicas de acceso.
2. `supabase/migrations/002_simplify_for_ai.sql` — Anade columnas `report_type` y `ai_analysis` a `reports`, elimina la tabla `client_configs`.
3. `supabase/migrations/003_access_logs.sql` — Crea la tabla `access_logs` para el registro de accesos y acciones, con indices y politicas RLS.

### 5. Configurar variables de entorno

Crea un archivo `.env.local` en la raiz del proyecto:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-publica
```

> **Nota**: La API Key de Anthropic/Claude **no** se configura aqui. Se almacena en `localStorage` del navegador y se configura desde la pagina de **Ajustes** dentro de la aplicacion.

### 6. Configurar Auth en Supabase

Para que el Magic Link funcione correctamente en desarrollo:

1. En Supabase, ve a **Authentication > URL Configuration**.
2. Configura:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs**: `http://localhost:3000/**`

### 7. Iniciar el servidor de desarrollo

```bash
npm run dev
```

La aplicacion estara disponible en `http://localhost:3000`.

## Despliegue en Vercel

### 1. Conectar repositorio

1. Ve a [vercel.com](https://vercel.com) y crea un nuevo proyecto conectado al repositorio de GitHub.
2. Vercel detectara automaticamente que es un proyecto Next.js.

### 2. Variables de entorno en Vercel

En **Settings > Environment Variables**, anade las siguientes variables para **los tres entornos** (Production, Preview, Development):

- `NEXT_PUBLIC_SUPABASE_URL` = `https://tu-proyecto.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `tu-anon-key-publica`

> **Importante**: asegurate de que las variables esten configuradas para los tres entornos. Si solo se configuran para Production, las previews y los builds de desarrollo fallaran con un error "No API key found".

### 3. Configurar Auth para produccion

Una vez desplegado, actualiza las URLs en Supabase (**Authentication > URL Configuration**):

- **Site URL**: `https://tu-dominio.vercel.app`
- **Redirect URLs**: `https://tu-dominio.vercel.app/**`

Si necesitas que funcione tanto en local como en produccion, anade ambas URLs a la lista de Redirect URLs.

### 4. Desplegar

```bash
git push origin main
```

Vercel desplegara automaticamente al detectar cambios en `main`.

## Uso de la aplicacion

### Primer acceso

1. Abre la aplicacion y accede con tu email via **Magic Link**.
2. Revisa tu bandeja de entrada y haz clic en el enlace recibido.

### Configuracion inicial (Ajustes)

1. Ve a **Ajustes** desde la barra de navegacion.
2. Configura los datos del **Emisor**: nombre de empresa, logo, telefonos, emails, web, LinkedIn y direcciones. Estos datos aparecen en el pie de pagina de los informes.
3. Introduce tu **API Key de Claude** (Anthropic). Se almacena solo en tu navegador (`localStorage`).

### Crear un cliente

1. Desde el **Dashboard**, haz clic en **Nuevo Cliente**.
2. Rellena el nombre del cliente y opcionalmente sube un logo.
3. El logo se almacena en el bucket `logos` de Supabase Storage.

### Generar un informe

El asistente de creacion consta de **3 pasos**:

#### Paso 1 — Datos basicos

- Selecciona el **cliente**.
- Indica el **titulo** y **periodo** del informe.
- Sube el archivo de datos (**Excel .xlsx/.xls** o **CSV**).
- La aplicacion parsea el archivo, calcula estadisticas por columna (`buildColumnStats`) y las envia a Claude via la API `/api/analyze`.

#### Paso 2 — Configuracion del analisis (IA)

Claude devuelve un analisis con:

- **Tipo de datos** detectado (ej: "encuesta de satisfaccion", "datos de contacto").
- **Columna de clasificacion / embudo** (opcional, solo si aplica).
- **Preguntas detectadas** con: texto, tipo de grafico sugerido, columna fuente, filtros opcionales y justificacion (`rationale`).

En este paso puedes:

- **Activar/desactivar preguntas** individualmente o en bloque (Todas / Ninguna).
- **Editar el texto** de cada pregunta en linea.
- **Cambiar el tipo de grafico** (barras, pastel, tabla, flujo).
- **Seleccionar el tipo de informe** global: Graficos, Tabla o Diagrama de Flujo.

#### Paso 3 — Generacion

- Haz clic en **Generar Informe**.
- El procesador (`processor.ts`) recorre las preguntas activas, aplica filtros por pregunta si existen, calcula frecuencias y genera los datos.
- La plantilla HTML correspondiente genera el informe final con portada, graficos/tablas y pie de pagina.
- El informe se guarda en Supabase y se muestra en pantalla.
- Desde la vista del informe puedes **descargarlo como HTML**, **exportar los datos a Excel** o **imprimir como PDF**.

## Scripts disponibles

```bash
npm run dev       # Servidor de desarrollo con Turbopack
npm run build     # Build de produccion
npm run start     # Servidor de produccion (tras build)
npm run lint      # Linting con ESLint
```

## Base de datos — Esquema

### emitter_settings

Configuracion de la empresa emisora de informes. Solo existe una fila.

- `company_name`, `logo_url`, `footer_phones[]`, `footer_emails[]`, `footer_web`, `footer_linkedin`, `footer_addresses[]`

### clients

Empresas para las que se generan informes.

- `name`, `logo_url`, `notes`, `created_by` (referencia a `auth.users`)

### reports

Informes generados.

- `client_id`, `title`, `period`, `report_type` (charts/table/flowchart), `report_html` (HTML completo), `report_data` (JSON con datos procesados), `ai_analysis` (JSON con analisis de Claude), `created_by`

### access_logs

Registro de accesos y acciones realizadas en la plataforma.

- `user_id`, `user_email`, `action` (page_view, login, report_created, report_exported_html, report_exported_excel, data_analyzed, client_created), `path`, `ip_address`, `user_agent`, `created_at`

Acciones registradas automaticamente:
- **page_view**: acceso a cualquier pagina (deduplicado a 1 registro cada 30 minutos)
- **login**: inicio de sesion via Magic Link
- **report_created**: guardado de un informe nuevo
- **report_exported_html / report_exported_excel**: descarga de informe
- **data_analyzed**: analisis de datos con IA
- **client_created**: creacion de un nuevo cliente

### Row Level Security

Todas las tablas tienen RLS habilitado. Las politicas permiten acceso completo a cualquier usuario autenticado (modelo de equipo compartido).

### Storage

Bucket `logos` publico para almacenar logotipos de clientes y del emisor.

## Seguridad

- La **API Key de Claude** se almacena exclusivamente en `localStorage` del navegador del usuario. Nunca se envia al servidor de la aplicacion ni se persiste en base de datos.
- Las llamadas a la API de Claude se realizan desde una **API Route de Next.js** (`/api/analyze`), que recibe la API Key en el header de la peticion.
- **Supabase Auth** protege todas las rutas bajo `(app)/` mediante middleware de Next.js.
- El **anon key** de Supabase es publica por diseno (la seguridad recae en RLS).

## Licencia

Proyecto privado. Todos los derechos reservados.
