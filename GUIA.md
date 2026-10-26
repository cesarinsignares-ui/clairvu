# Guía de puesta en línea (piloto)

Tiempo estimado: 45–60 minutos. Coste: el dominio (~10–15 €/año) y unos euros de crédito de IA.

Contenido de la carpeta:
- `site/`: la web. Contiene la página del cliente (`/nombre-del-artesano`), la app del artesano (`/app`) y las mentions légales.
- `netlify/functions/`: el resumen automático con IA.
- `supabase/schema.sql`: la base de datos y las reglas de seguridad.

---

## 1. Supabase (base de datos y fotos)
1. Crea una cuenta en supabase.com y pulsa **New project**.
2. Ponle un nombre, guarda la contraseña de la base de datos y elige una **región en Europa** (París o Fráncfort).
3. Abre **SQL Editor → New query**, pega todo `supabase/schema.sql` y pulsa **Run**. Debe terminar sin errores.
4. En **Authentication → Sign In / Providers**, desactiva **"Allow new users to sign up"**. Así solo tú creas las cuentas de los artesanos.
5. En **Authentication → Users → Add user**, pon el e-mail y la contraseña del artesano (o los tuyos para probar) y marca **Auto Confirm User**.
6. En **Project Settings → API Keys** (o **API**), copia estos tres datos:
   - **Project URL**: algo como `https://abcd.supabase.co`
   - la clave **publishable** o **anon**: es pública y va en la web
   - la clave **secret** o **service_role**: es privada, NUNCA va en la web

## 2. Rellenar `site/config.js`
Abre el archivo con un editor de texto y cambia:
- `SUPABASE_URL`: la Project URL
- `SUPABASE_ANON_KEY`: la clave publishable/anon
- `APP_NAME`: el nombre elegido para el servicio
- `CONTACT_EMAIL`: tu e-mail para las preguntas de datos personales

## 3. Anthropic (la IA)
1. En console.anthropic.com, crea una cuenta, añade algo de crédito y fija un **límite de gasto** bajo.
2. En **API Keys → Create Key**, copia la clave. NUNCA la pongas en la web ni la pegues en un chat.

## 4. GitHub (donde vive el código)
1. Crea una cuenta en github.com y un repositorio **privado** nuevo, por ejemplo `devis-app`.
2. Pulsa **Add file → Upload files** y arrastra TODO el contenido de esta carpeta: `site`, `netlify`, `supabase`, `netlify.toml` y esta guía.
3. Pulsa **Commit changes**.

Alternativa: crea el repositorio vacío, dile su nombre a Claude y lo sube por ti.

## 5. Netlify (publicar la web)
1. En netlify.com, crea una cuenta con GitHub y ve a **Add new project → Import an existing project → GitHub**. Elige el repositorio.
2. No cambies nada en los ajustes de compilación: los lee de `netlify.toml`. Pulsa **Deploy**.
3. Ve a **Project configuration → Environment variables** y añade:
   - `SUPABASE_URL` = la Project URL
   - `SUPABASE_SERVICE_KEY` = la clave secret/service_role
   - `ANTHROPIC_API_KEY` = la clave de Anthropic
4. Ve a **Deploys → Trigger deploy → Deploy project** para que se apliquen las claves.

## 6. Dominio
En Netlify, entra en **Domain management → Add a domain**. Puedes comprarlo ahí mismo, o comprarlo en OVH o Gandi y seguir las instrucciones de Netlify para apuntarlo. El certificado HTTPS se activa solo.

## 7. Prueba completa (10 minutos)
1. Abre `tudominio.fr/app` en el móvil, entra con el usuario creado y completa la ficha de la empresa: nombre, oficio, enlace y tarifas.
2. En la pestaña **Envoyer le lien**, mándate el SMS a tu propio móvil.
3. Abre el enlace del SMS como si fueras un cliente, rellena el formulario con 2 fotos y envía.
4. En la app, la solicitud debe aparecer en unos segundos. El resumen de la IA llega en menos de un minuto.
5. Prueba también **Sur place** y la instalación en la pantalla de inicio (**Réglages**).

## Para dar de alta a un artesano del piloto
Créale el usuario en Supabase (paso 1.5) y dale su e-mail y su contraseña. Al entrar por primera vez, rellena su ficha y le aparece su enlace.

## A vigilar
- **Netlify gratis**: 300 créditos al mes con límite estricto. Cada publicación cuesta 15 créditos, así que no publiques decenas de cambios al mes. Si se agotan, la web se pausa hasta el mes siguiente.
- **Supabase gratis**: si el proyecto pasa 7 días sin actividad, se pausa y hay que reactivarlo a mano desde el panel.
- **Mentions légales** (`site/mentions.html`): completa lo que está en amarillo (tu estatus, SIRET, dirección) y haz validar el texto RGPD antes de usarlo con clientes reales.
- **Las claves secretas** solo van en las variables de entorno de Netlify, nunca en `config.js`.
