# AWS: plan de migración de Ringee

Plan de infraestructura · 3 de noviembre de 2026 · base `a2b17ad0` (main)

Estado (4 de noviembre de 2026): **en marcha.** Créditos de Activate emitidos. Decidido: nivel B con un solo nodo de Valkey y staging de al menos 6 meses (§4.9). AWS-06, AWS-07, AWS-33 y la documentación de AWS-08 están en la rama `feat/aws-migration-prep`, sin commitear ni desplegar. El Terraform y los scripts de operación están en el repo local `ringee-infra`, fuera de este repo porque este es público: validados y sin aplicar. No se ha creado nada en AWS. Las cifras de uso salen de la API de Railway (métricas horarias del 4 de octubre al 3 de noviembre de 2026), del DNS público y del código. Marca cada casilla al cerrarla y cita su ID (`AWS-01`…) en el commit o PR.

Alcance: solo Ringee, es decir, el proyecto "Ringee" de Railway (production), el frontend en Vercel y lo que cuelga de `ringee.io`. Los demás proyectos de Railway quedan fuera. TriggerLoop se queda donde está: Ringee lo llama por HTTPS y eso no cambia.

Referencia: [gitroomhq/postiz-aws](https://github.com/gitroomhq/postiz-aws), una migración reciente de Railway a AWS con un stack muy parecido (NestJS, Prisma, Temporal, Next.js). Sirve de guía, no de plantilla (§3).

## 0. En una página

- **Lo que corre hoy es pequeño.** Son 11 servicios en Railway (región us-east4, Ashburn) que entre todos promedian ~0.25 vCPU y ~5 GB de RAM. La BD principal ocupa 1.4 GB. Railway estima **~$57/mes** para este proyecto. El frontend está en Vercel (iad1), las grabaciones en R2 y el DNS en Cloudflare.
- **AWS no va a salir más barato que Railway a este tamaño.** Lo mínimo serio cuesta ~$180/mes y lo recomendado ~$260/mes on-demand (~$210 con compromisos a un año). El setup de Postiz (~$930/mes) está dimensionado para mucha más carga que la tuya. Lo que sí compras: BD Multi-AZ con restauración a cualquier minuto (PITR), red privada, IAM y auditoría, deploys que aplican las migraciones, un staging real y créditos: Activate emitió $5,000 que vencen en 2 años, y con compromisos sin pago inicial cubren casi todo ese tiempo el nivel recomendado (§5.3).
- **Arquitectura recomendada:** us-east-1, ECS Fargate ARM64, RDS PostgreSQL 17 Multi-AZ (una instancia con la BD de la app y la de Temporal), ElastiCache Valkey, Temporal self-hosted en ECS, ALB y sin NAT. Cloudflare (DNS) y R2 se quedan. Infraestructura con Terraform y deploys con GitHub OIDC.
- **Antes de mudarte hay que tocar código (§6).** El SSE del dialer vive en la memoria del proceso, así que con dos réplicas de la API se pierden asignaciones de leads. La API no apaga el dialer al recibir SIGTERM. Detrás del ALB hace falta `TRUST_PROXY_HOPS=1`. Y las migraciones siguen fuera de git, así que ningún pipeline puede aplicarlas.
- **Corte:** de viernes a sábado entre 01:00 y 04:00 (hora de RD), la franja más quieta de los últimos 30 días. `pg_dump`/`pg_restore` tarda minutos con 1.4 GB. Temporal arranca vacío, porque no hay workflows con timers largos y los schedules se recrean al arrancar el orchestrator. Los hostnames no cambian, así que Telnyx, Stripe, Clerk, OAuth, MCP, la extensión, el SDK y la CLI no necesitan ningún cambio.

## 1. Lista de trabajo

### Fase 0 — Decisiones y cuenta

- [ ] **AWS-01** Responder las decisiones abiertas de §13 (nivel A o B, frontend y región). _4 nov: nivel B con un solo nodo de Valkey y staging de al menos 6 meses. Falta la región; el Terraform usa us-east-1 por defecto._
- [x] **AWS-02** Créditos de Activate: $5,000 emitidos el 3 de noviembre de 2026, con vencimiento a 2 años (§5.3).
- [ ] **AWS-03** AWS Organizations con una cuenta de gestión (solo facturación), `ringee-prod` y `ringee-staging`. IAM Identity Center con MFA; root con MFA y sin claves. _4 nov: organización creada (todas las funciones) con la cuenta de los créditos como gestión; root ya tenía MFA, sin claves ni usuarios IAM. Creadas `ringee-prod` y `ringee-staging`. Identity Center activo en us-east-1 (una región, llave de AWS), con el grupo de administradores y permisos de admin y solo lectura en las tres cuentas (`ringee-infra/scripts/identity-center-setup.sh`). Faltan el primer login con MFA, cerrar la sesión de root y comprobar el credit sharing._
- [ ] **AWS-04** Budgets con alertas al 50, 80 y 100 %, Cost Anomaly Detection y etiquetas `Project`/`Env`/`Service` activadas para costos. _3 nov: `ringee-gross-monthly-spend` ($210, alertas 80/100 % real y 100 % pronóstico) se crea sin filtro, porque Cost Explorer aún no tiene datos. **Pendiente:** cuando corran los primeros recursos, editarlo y añadir `Charge type` → `Excludes` → `Credit`, `Refund`, y ajustar el importe mientras exista el staging (§5.3)._
- [ ] **AWS-05** Identificar qué lee la BD principal desde fuera de Railway (§2, hallazgo 1).

### Fase 1 — Código (se despliega primero en Railway)

- [ ] **AWS-06** SSE del dialer por Redis. _Implementado en `feat/aws-migration-prep`; falta el arranque de DI con Redis local y desplegarlo en Railway._
- [ ] **AWS-07** Apagado ordenado de la API. _Implementado en `feat/aws-migration-prep`._
- [ ] **AWS-08** `TRUST_PROXY_HOPS` para el ALB. _Documentado en `.env.example`; el valor `1` se pone en la tarea de ECS (AWS-19)._
- [ ] **AWS-09** Migraciones en git y `migrate deploy` en el pipeline.
- [ ] **AWS-10** Imagen de `chatgpt-mcp` reproducible y ARM64.
- [ ] **AWS-11** Comando y puerto explícitos para ECS. _Resuelto en el Terraform: la tarea `api` fija su `command` y `PORT=3000`._
- [ ] **AWS-33** Listener de errores en el cliente de Redis. _Implementado en `feat/aws-migration-prep`._
- [ ] **AWS-34** Que los comandos de Redis fallen rápido cuando no hay conexión, revisando cada llamador.

### Fase 2 — Infraestructura (Terraform)

_4 nov: escrito en `ringee-infra` (local, sin commit ni repo en GitHub todavía). Pasa `terraform validate` y un `terraform test` que aplica el stack completo contra proveedores simulados. No se ha aplicado nada en AWS._

- [ ] **AWS-12** Repo `ringee-infra` (privado), estado en S3 con bloqueo nativo, roles OIDC.
- [ ] **AWS-13** Red: VPC en 2 AZ, subredes públicas y privadas, sin NAT, security groups.
- [ ] **AWS-14** ECR (tags inmutables, escaneo, lifecycle) y clúster ECS Fargate.
- [ ] **AWS-15** RDS PostgreSQL 17 con parámetros y alarmas.
- [ ] **AWS-16** ElastiCache Valkey con TLS y AUTH.
- [ ] **AWS-17** ALB, certificados ACM validados en Cloudflare y reglas por host.
- [ ] **AWS-18** Secrets Manager y el script que copia las variables de Railway. _`scripts/railway-env.py` corrió en seco: 108 variables compartidas, 1 solo de la API y 16 de chatgpt-mcp. Ninguna apunta a la red privada de Railway; las dos de TriggerLoop usan su dominio público, que sigue funcionando._
- [ ] **AWS-19** Servicios ECS `api`, `orchestrator`, `temporal`, `temporal-ui` (0 tareas) y `chatgpt-mcp`; tareas puntuales `migrate` y `ops`.
- [ ] **AWS-20** Observabilidad: logs con retención, alarmas y chequeo externo de `/api/health`.

### Fase 3 — Pipeline

- [ ] **AWS-21** `deploy-aws.yml`: build ARM64, push a ECR, `migrate`, rolling deploy y smoke test. _4 nov: escrito en `feat/aws-migration-prep`, sin commit. `staging` despliega en la cuenta de staging y `main` en prod, con aprobación. Nada despliega hasta definir `AWS_DEPLOY_ENVIRONMENTS`._
- [ ] **AWS-22** Entorno `production` de GitHub con revisores; ninguna clave de AWS en GitHub. _Los entornos van en `ringee-app`, que es público. En `ringee-infra`, privado, GitHub no permite revisores obligatorios por debajo de Enterprise: su CI solo planifica y el apply se hace desde una estación con SSO._

### Fase 4 — Ensayo

- [ ] **AWS-23** Staging durante al menos 6 meses, apagado fuera de horario y sin la cuenta de Telnyx de producción (§4.9).
- [ ] **AWS-24** Ensayo completo del corte con una copia de la BD, midiendo tiempos.
- [ ] **AWS-25** Pruebas con 2 tareas de API: dialer por campaña, transcripción en vivo y WebSockets.

### Fase 5 — Corte

- [ ] **AWS-26** Runbook de §10.

### Fase 6 — Después del corte

- [ ] **AWS-27** Desconectar GitHub de Railway y borrar sus servicios de cómputo **el mismo día**.
- [ ] **AWS-28** Reconciliar con Telnyx las llamadas de la ventana.
- [ ] **AWS-29** Conservar la BD de Railway 14 días y después borrar el proyecto.
- [ ] **AWS-30** A los 30–60 días: Savings Plans o reservas, y ajuste de tamaños.

### Fase 7 — Opcional

- [ ] **AWS-31** Frontend de Vercel a ECS con CloudFront (§11).
- [ ] **AWS-32** Blog estático a S3 con CloudFront.

## 2. Lo que corre hoy

Medido el 3 de noviembre de 2026. CPU y RAM son promedios horarios de los últimos 30 días.

| Servicio de Railway  | Qué es                                                                  | CPU prom / p95 (vCPU) | RAM prom / p95 / máx (GB) | Disco usado | En AWS                                         |
| -------------------- | ----------------------------------------------------------------------- | --------------------- | ------------------------- | ----------- | ---------------------------------------------- |
| Api                  | NestJS en `api.ringee.io`; 1 réplica, sin healthcheck, con App Sleeping | 0.016 / 0.034         | 0.32 / 0.51 / 0.89        | —           | servicio ECS `api`                             |
| Orchestrator         | worker de Temporal                                                      | 0.063 / 0.108         | 0.45 / 0.55 / 1.00        | —           | servicio ECS `orchestrator`                    |
| Postgres             | BD principal, PostgreSQL 17                                             | 0.052 / 0.090         | 1.26 / 1.48 / 1.58        | 1.4 GB      | RDS, base `ringee`                             |
| postgres-replica     | réplica por streaming; ningún servicio la usa                           | 0.006 / 0.011         | 0.52 / 0.69 / 1.81        | 2.4 GB      | no se migra: la sustituye Multi-AZ             |
| Postgres-tKeQ        | BD de Temporal, PostgreSQL 17.11 (límite de 1 GB de RAM, al 94 %)       | 0.044 / 0.051         | 0.94 / 0.97 / 0.99        | 1.9 GB      | RDS, misma instancia; arranca vacía            |
| Temporal Auto Setup  | servidor Temporal 1.29.7, visibility en Postgres                        | 0.058 / 0.064         | 1.14 / 1.17 / 1.17        | —           | servicio ECS `temporal` (imagen `server`)      |
| Temporal UI          | interfaz web 2.54.1                                                     | ~0                    | 0.01                      | —           | servicio ECS con 0 tareas, sin dominio público |
| Temporal Admin Tools | CLI de Temporal                                                         | 0                     | 0                         | —           | tarea puntual `ops`                            |
| Redis                | 8.2.9: caché, lease de una llamada a la vez, webhooks huérfanos         | 0.004 / 0.004         | 0.01 / 0.02 / 0.06        | 1.0 GB      | ElastiCache Valkey                             |
| Elasticsearch        | sin deployment activo; Temporal corre con `ENABLE_ES=false`             | —                     | —                         | 0.3 GB      | no se migra                                    |
| chatgpt-mcp          | app de ChatGPT en `chatgpt.ringee.io`                                   | 0.001 / 0.001         | 0.21 / 0.25 / 0.71        | —           | servicio ECS `chatgpt-mcp`                     |

Fuera de Railway: Vercel sirve `www.ringee.io`, `ringee.io`, `blog.ringee.io` y `getringee.com` desde iad1 (Washington). Mintlify sirve `docs.ringee.io`. Cloudflare tiene el DNS, el bucket R2 (`statics.ringee.io`) y el email routing. Telnyx, Stripe, Clerk, Deepgram, OpenAI/Anthropic, Resend, Firebase, Sentry y TriggerLoop son proveedores y no se mueven.

**Costo actual.** La API de Railway estima ~$57 para el período en curso: RAM $47.6, CPU $5.1, 61 GB de egress $3.0 y volúmenes $1.0. Casi todo es RAM, y más de la mitad de esa RAM la usan las dos BD y Temporal.

Hallazgos que cambian el plan:

1. **Algo lee la BD principal desde fuera de Railway.** La BD saca ~15.6 GB/mes hacia fuera de la red privada de Railway (el tráfico interno no cuenta como egress). En AWS, RDS será privado. Si ese cliente (un BI, n8n, una máquina local) no se identifica antes del corte, seguirá usando la copia vieja sin que nadie lo note. Es la primera trampa del runbook de Postiz.
2. **Variables que no se copian:** `REDIS_HOST` y `REDIS_PORT`. El código solo lee `REDIS_URL` (`packages/platform/src/redis/redis.module.ts:12`).
3. **Elasticsearch, `postgres-replica` y Admin Tools no se migran.** Temporal usa visibility en Postgres, nadie lee la réplica y la CLI corre como tarea puntual.
4. **La API tiene App Sleeping activado y no tiene healthcheck.** Si llegara a dormirse, el primer webhook de Telnyx esperaría un arranque en frío (el loop del dialer probablemente la mantiene despierta). En ECS no existe ese modo y el ALB comprueba `/api/health`.

## 3. Qué tomar de Postiz y qué no

Postiz movió su app y Temporal de Railway a AWS us-east-2 con Terraform, ECS, RDS, Valkey y Elasticsearch, y dejó R2 y el DNS de Cloudflare donde estaban.

| Tomar                                                                                  | Por qué                                                                          |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Terraform en módulos (`network`, `ecs-cluster`, `ecs-service`, `rds-postgres`)         | está probado en un stack casi igual y ahorra semanas                             |
| Sin NAT: tareas con IP pública y un security group que solo admite al ALB              | NAT cuesta ~$33/mes por AZ más $0.045/GB, y casi todo tu tráfico sale a internet |
| Una sola instancia RDS para la app y Temporal                                          | es más barato, y Temporal hereda la conmutación Multi-AZ                         |
| GitHub OIDC, entornos con revisores y migraciones como tarea puntual antes del rollout | elimina las claves estáticas y el "creí que la migración había corrido"          |
| Runbook con ensayo, tiempos medidos y workers apagados hasta el go-live                | evita efectos dobles si hay que volver atrás                                     |
| Secretos copiados por script; Terraform solo conoce los nombres                        | el state no guarda secretos                                                      |
| Savings Plans comprados en la consola tras un mes de uso real                          | se compromete lo que de verdad se usa                                            |
| Presupuesto de conexiones por rol y alarma de conexiones                               | con Prisma y Temporal en la misma instancia, importa                             |

| No tomar                                    | Por qué                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Hosts r8g.xlarge y db.r8g.large (~$930/mes) | tu carga cabe con holgura en ~$260                                                        |
| ECS sobre EC2 con hosts propios             | a tu tamaño Fargate cuesta ~$20/mes más y no hay servidores que parchear                  |
| Elasticsearch para Temporal                 | ya usas visibility en Postgres                                                            |
| Copia exacta de la BD de Temporal           | Postiz guarda posts programados como workflows con timers; los tuyos duran minutos (§4.5) |
| Temporal UI pública con basic auth          | mejor sin dominio público: túnel de SSM o ALB con login de Google                         |
| SES en vez de Resend                        | cambiar de proveedor de email es otro proyecto                                            |
| Repo de infraestructura público             | nada se gana publicándolo                                                                 |

## 4. Arquitectura objetivo

```
                          Cloudflare DNS
          api.ringee.io (solo DNS)      chatgpt.ringee.io (proxied)
                     │                        │
             ┌───────▼────────────────────────▼───────┐
             │ ALB · HTTPS · reglas por host           │    us-east-1 · 2 AZ
             └───────┬────────────────────────┬───────┘
 subredes            │                        │
 públicas     ┌──────▼───────┐        ┌───────▼──────┐   ┌──────────────┐
 (IP por      │ api ×2       │        │ chatgpt-mcp  │   │ orchestrator │
 tarea; solo  │ REST · MCP   │        │ ×1           │   │ ×1           │
 entra lo que │ SSE · WS     │        └──────────────┘   └──────┬───────┘
 permiten los │ dialer       ├──────► temporal ×1 ◄─────────────┤
 SG)          └──────┬───────┘   (Cloud Map, :7233)             │
                     │                   │                      │
 subredes     ┌──────▼───────────────────▼──────────────────────▼──┐
 privadas     │ RDS PostgreSQL 17 Multi-AZ                          │
 (sin         │   ringee · temporal · temporal_visibility           │
 internet)    │ ElastiCache Valkey (un nodo)                        │
              └─────────────────────────────────────────────────────┘

 Fuera de AWS: Vercel (frontend) · R2 · Telnyx · Stripe · Clerk · Deepgram · LLMs · Resend · TriggerLoop
```

### 4.1 Región: us-east-1

Railway corre en us-east4 (Ashburn) y las funciones de Vercel en iad1 (Washington). us-east-1 está en el mismo metro, así que la latencia hacia el frontend, Telnyx y los usuarios no cambia. us-east-2 (Ohio) cuesta lo mismo y suma ~10 ms; elígelo si prefieres quedarte fuera de us-east-1 después de su caída del 20 de octubre de 2025.

### 4.2 Cómputo: ECS Fargate en ARM64 (Graviton)

Fargate en ARM cuesta ~20 % menos que en x86. Las imágenes ya son Debian slim; solo hay que construirlas para `linux/arm64`.

Descartados: App Runner (cerrado a clientes nuevos desde el 30 de abril de 2026), EKS (~$73/mes solo el control plane, más la operación) y ECS sobre EC2 (ahorra ~$20/mes a tu tamaño, pero hay que parchear y reemplazar hosts). ECS Express Mode sirve para una prueba rápida; para producción, con red propia y varios servicios, Terraform explícito.

| Servicio ECS     | Tarea              | Réplicas           | Por qué                                                                                     |
| ---------------- | ------------------ | ------------------ | ------------------------------------------------------------------------------------------- |
| `api`            | 0.5 vCPU / 2 GB    | 2 (1 hasta AWS-06) | máximo observado 0.89 GB; dos tareas en AZ distintas aguantan la caída de un AZ o un deploy |
| `orchestrator`   | 0.5 vCPU / 2 GB    | 1                  | máximo 1.0 GB; Temporal reintenta si la tarea cae                                           |
| `temporal`       | 0.5 vCPU / 2 GB    | 1                  | 1.14 GB observados; todos los roles en un proceso, como hoy                                 |
| `chatgpt-mcp`    | 0.25 vCPU / 1 GB   | 1                  | máximo 0.71 GB                                                                              |
| `temporal-ui`    | 0.25 vCPU / 0.5 GB | 0                  | se enciende para depurar                                                                    |
| `migrate`, `ops` | tareas puntuales   | —                  | `prisma migrate deploy`; `pg_dump` y CLI de Temporal                                        |

`api` escala por CPU (objetivo 60 %) hasta 4 tareas. Para entrar a un contenedor se usa ECS Exec; no hay SSH.

### 4.3 Red

- VPC /16 en dos AZ. En las subredes públicas van el ALB y las tareas con IP pública; en las privadas, RDS y Valkey, sin ruta a internet.
- Sin NAT Gateway. Una tarea de Fargate sin NAT necesita IP pública para bajar su imagen de ECR y llamar a Telnyx o Stripe ($3.65/mes por IP). Sale más barato que un NAT y no deja un AZ como punto único de salida.
- Security groups: el ALB recibe 443 de internet; `api` y `chatgpt-mcp` solo reciben del ALB; `temporal` solo recibe el 7233 de `api` y `orchestrator`; RDS y Valkey solo reciben de las tareas que los usan; `orchestrator` no tiene entrada.
- Con Fargate en subred pública la IP de salida cambia en cada deploy. Si un cliente necesita poner la IP de Ringee en su allowlist (Custom Integrations, Odoo), mueve las tareas a subredes privadas con un NAT Gateway y una Elastic IP (+~$35/mes).

### 4.4 Datos

- **RDS PostgreSQL 17**, db.t4g.medium (2 vCPU, 4 GB) Multi-AZ, 30 GB gp3 con autoescalado de almacenamiento. Backups automáticos de 14 días con PITR, cifrado en reposo, TLS obligatorio y protección contra borrado. Una instancia con tres bases: `ringee`, `temporal` y `temporal_visibility`. Hoy las dos BD suman ~2.2 GB de RAM en contenedores separados, y 4 GB alcanzan para ambas.
- **Conexiones:** `connection_limit` explícito en cada `DATABASE_URL` (por ejemplo, 15 por tarea de `api`, 10 en `orchestrator`, 2 en `migrate`) y `maxConns` acotado en Temporal, con una alarma por encima de ~300.
- **ElastiCache para Valkey 8**: un solo nodo cache.t4g.micro (decidido el 4 de noviembre de 2026), cluster mode desactivado, TLS y AUTH (`REDIS_URL` pasa a `rediss://`). Mantenimiento los sábados de 05:00 a 06:00 UTC (01:00–02:00 en RD). Si el nodo falla, ElastiCache lo reemplaza en minutos y se pierde lo que guardaba, que es efímero; las llamadas siguen porque el lease cae a Postgres (AWS-34 hace falta para que no esperen). Añadir una réplica después es un cambio en línea. No Serverless: exige un cliente que hable cluster mode y el código usa un cliente de un solo nodo (`createClient`); Postiz tropezó con lo mismo. Redis no se migra: lo que guarda es efímero y el corte arranca sin llamadas activas.
- **R2 se queda.** Las grabaciones se sirven desde `statics.ringee.io` sin costo de egress. Pasar a S3 exigiría un proveedor nuevo en `packages/platform/src/upload/upload.factory.ts`, copiar los objetos y reescribir URLs, y hoy no aporta nada.

### 4.5 Temporal: self-hosted, arranque limpio

- Imagen `temporalio/server` con la versión de hoy (1.29.x), no `auto-setup`, que Temporal no recomienda para producción. El esquema se crea y actualiza con `temporalio/admin-tools` como tarea puntual, y las actualizaciones avanzan de una versión menor en una.
- `numHistoryShards` no se puede cambiar después de crear el clúster; hoy es 4. Para tu volumen basta con 4–16, y más shards suben la carga base sobre la BD.
- **No se copia la BD de Temporal.** Ningún workflow duerme (`sleep`), y las actividades más largas tienen un tope de 1 h con pocos reintentos (`apps/orchestrator/src/temporal/workflows.ts`). Basta con dejar drenar los workflows en curso antes del corte: `ensureSchedules` recrea los 15 schedules al arrancar el orchestrator (`apps/orchestrator/src/temporal/schedules.ts`). Solo se pierde el historial de ejecuciones viejas.
- **Por qué no Temporal Cloud:** los 15 schedules disparan ~887,000 ejecuciones al mes, y el de 5 s (`custom-integrations-drain`) es el 58 %. Eso son ~1.8–2.7 M de acciones, ~$140–185/mes frente a ~$17 en ECS. Vale la pena revisarlo si operar Temporal se vuelve una carga.
- **UI sin dominio público:** se enciende cuando hace falta y se abre con un túnel de SSM, o detrás del ALB con autenticación OIDC (Google Workspace) si quieres una URL.

### 4.6 Borde, DNS y TLS

- Cloudflare sigue siendo el DNS. `api.ringee.io` pasa a ser un CNAME al ALB, solo DNS, como hoy. `chatgpt.ringee.io` sigue proxied, con el ALB como origen y SSL en "Full (strict)".
- Certificados ACM gratuitos para ambos, validados con registros CNAME en Cloudflare días antes del corte.
- ALB con redirección HTTP→HTTPS, política TLS 1.3, reglas por host, health check en `/api/health` (público, `apps/backend/src/app.controller.ts:15`) e idle timeout de 120 s. El SSE del dialer manda un heartbeat cada 15 s (`apps/backend/src/api/routes/dialer.controller.ts:434-438`), y los WebSockets `/ws/user-events` y `/media-stream` pasan por el ALB sin configuración extra.

### 4.7 Secretos y configuración

- Secrets Manager, un JSON por ámbito: `ringee/prod/shared`, `ringee/prod/api`, `ringee/prod/orchestrator` y `ringee/prod/chatgpt-mcp`. De las variables de Railway Terraform solo conoce los nombres (`config/secret-keys.json`). RDS gestiona su contraseña maestra, que solo usa la tarea `db-bootstrap`. Las contraseñas de los roles `ringee_app` y `temporal` y el token de Valkey los genera Terraform en `ringee/prod/generated`; por eso el state vive en un bucket privado, cifrado y con versiones.
- Un script copia las variables de Railway (más de 100 por servicio, casi todas compartidas entre Api y Orchestrator), reescribe `DATABASE_URL`, `REDIS_URL` y `TEMPORAL_ADDRESS`, y descarta `RAILWAY_*` y las `REDIS_*` que el código no lee. Se corre en seco primero y otra vez justo antes del corte, por si alguien cambió algo en Railway.
- Lo que no es secreto va como variable normal: `TRUST_PROXY_HOPS=1`, `PORT=3000`, `NODE_ENV=production` y `TEMPORAL_ADDRESS=temporal.ringee.internal:7233`.

### 4.8 Lo que no cambia

Todos los consumidores siguen apuntando a `api.ringee.io`: la web, la extensión, el SDK, la CLI, Attio, HubSpot, la app de ChatGPT, el MCP y los webhooks salientes de Custom Integrations. Tampoco cambian las URLs que tienen configuradas Telnyx, Stripe, Clerk, HubSpot, Attio, Google y Microsoft, ni `TRANSCRIPTION_MEDIA_STREAM_PUBLIC_URL`.

### 4.9 Staging

Decidido el 4 de noviembre de 2026: al menos 6 meses, en la cuenta `ringee-staging`, con la forma de producción en tamaño mínimo.

- **Recursos:** ALB; `api` y `orchestrator` de 0.25 vCPU / 1 GB y `temporal` de 0.25 vCPU / 2 GB; RDS db.t4g.small Single-AZ con 20 GB; un nodo de Valkey. `api` sube a 2 tareas para AWS-25 y `chatgpt-mcp` queda en 0 tareas hasta que haga falta.
- **Horario:** encendido los días laborables de 08:00 a 22:00 (hora de RD). Fuera de ese horario los servicios bajan a 0 tareas y RDS se detiene con EventBridge Scheduler; un comando lo enciende cuando haga falta. Los schedules de Temporal tienen ventanas de catch-up de minutos (`apps/orchestrator/src/temporal/schedules.ts`), así que al encender no se disparan ejecuciones atrasadas.
- **Costo:** ~$70/mes con ese horario y ~$105/mes encendido 24/7. El ALB y Valkey no se pueden detener y son la mitad de la cifra con horario.
- **Proveedores propios:** una cuenta de Telnyx aparte, Stripe en modo test, una instancia de desarrollo de Clerk, apps OAuth de desarrollo (HubSpot, Attio, Google y Microsoft) con las URLs de staging y un proyecto de Firebase aparte.
- **Frontend:** una rama de Vercel con dominio fijo y sus propias variables, porque la API solo acepta credenciales desde `FRONTEND_URL` (`apps/backend/src/main.ts`).
- **Datos:** sembrados, nunca una copia de producción. El ensayo del corte (AWS-24) restaura la copia en la cuenta de producción y la borra al terminar.

## 5. Costos

Precios on-demand de us-east-1 en noviembre de 2026. Confírmalos en la calculadora de AWS antes de comprometerte.

### 5.1 Dos niveles

| Componente                                                                               | A — mínimo serio            | B — recomendado             |
| ---------------------------------------------------------------------------------------- | --------------------------- | --------------------------- |
| Fargate ARM (`api`, `orchestrator`, `temporal`, `chatgpt-mcp`)                           | 1 + 1 + 1 + 1 tareas: $59.6 | 2 + 1 + 1 + 1 tareas: $76.6 |
| RDS PostgreSQL db.t4g.medium + 30 GB gp3                                                 | Single-AZ: $50.9            | Multi-AZ: $101.8            |
| ElastiCache Valkey cache.t4g.micro                                                       | 1 nodo: $9.3                | 2 nodos: $18.7              |
| ALB (horas, ~1 LCU y 2 IPv4)                                                             | $29.6                       | $29.6                       |
| IPv4 públicas de las tareas ($3.65 cada una)                                             | 4: $14.6                    | 5: $18.3                    |
| CloudWatch (~10 GB de logs y alarmas), Secrets Manager, ECR, GuardDuty, tráfico entre AZ | ~$16                        | ~$16                        |
| **Total al mes**                                                                         | **~$180**                   | **~$260**                   |
| Con compromisos a 1 año (§5.2), aproximado                                               | ~$150                       | ~$210                       |

El egress a internet es ~61 GB/mes y AWS no cobra los primeros 100 GB de cada mes.

La diferencia entre A y B es la BD Multi-AZ, la segunda tarea de la API y la réplica de Valkey. Son tres cambios independientes, y **cada uno se hace en los dos sentidos sin downtime:** activar o quitar Multi-AZ en RDS es una modificación en línea (al quitarlo, RDS borra solo la standby y no toca la primaria), y lo mismo vale para añadir o quitar una tarea o la réplica de Valkey. En Terraform es cambiar una variable. Lo único que no se deshace son los compromisos (§5.2).

**Elegido el 4 de noviembre de 2026: B con un solo nodo de Valkey**, ~$250/mes on-demand y ~$205 con compromisos.

Lo que se pierde en A: si falla el host de la BD, RDS lo reemplaza con unos minutos de corte; si cae la zona entera, hay que esperar a que vuelva o restaurar desde el backup en otra zona, con hasta 5 minutos de escrituras perdidas. Con una sola tarea de API, si se cae, el servicio para un par de minutos hasta que ECS la reemplaza; los deploys siguen sin corte.

### 5.2 Compromisos (a los 30–60 días, no antes)

- Compute Savings Plan de 1 año, que cubre Fargate.
- RDS: instancia reservada de 1 año (~30 % menos en t4g.medium) o un Database Savings Plan (existen desde diciembre de 2025: hasta 20 % en instancias aprovisionadas, 1 año sin pago inicial).
- Valkey: nodos reservados.
- Siempre **sin pago inicial**: los créditos de Activate cubren el cargo mensual de reservas y Savings Plans, pero no el pago por adelantado.
- **Se compromete el piso, no el techo.** Todo lo que usa A también lo usa B, así que un compromiso del tamaño de A se sigue aprovechando entero al subir a B. Uno del tamaño de B se desperdicia en parte si bajas a A: pagas lo que ya no usas hasta que vence. Los Database Savings Plans cubren Single-AZ y Multi-AZ por igual, y una reserva de RDS se aplica a los dos dentro de la misma familia (t4g).
- Se compran en la consola, no en Terraform, sobre el uso real, como hace Postiz.

### 5.3 Créditos: $5,000 a 2 años

Activate emitió $5,000 el 3 de noviembre de 2026; vencen a los 2 años (la fecha exacta aparece en Billing → Credits). Para que duren exactamente ese tiempo, el gasto tiene que promediar **~$208/mes**.

Con el staging de al menos 6 meses apagado fuera de horario (~$70/mes, §4.9):

| Escenario                                                                                              | Total en 2 años | Cuánto duran los créditos | De tu bolsillo |
| ------------------------------------------------------------------------------------------------------ | --------------- | ------------------------- | -------------- |
| B desde el primer día; compromisos desde el tercer mes                                                 | ~$5,560         | ~21 meses                 | ~$560          |
| A mientras existe el staging y B desde el séptimo mes; compromisos del tamaño de A desde el tercer mes | ~$5,160         | ~23 meses                 | ~$160          |
| A los 24 meses; compromisos desde el tercer mes                                                        | ~$4,080         | los 24; sobran ~$920      | $0             |

Con lo elegido (B con un solo nodo de Valkey) y este staging: **~$5,440 en 2 años, ~$440 de tu bolsillo**, y los créditos duran ~22 meses. Con el staging encendido 24/7 (~$105/mes), cada fila suma ~$210. Sin staging, como referencia: A on-demand ~$4,320 (sobran ~$680), B on-demand ~$6,240 (~$1,240 de tu bolsillo) y B con compromisos desde el tercer mes ~$5,140 (~$140).

Decisión (4 de noviembre de 2026): B desde el primer día con un solo nodo de Valkey, y compromisos sin pago inicial cuando haya 30–60 días de uso real. El mes del corte, Railway sigue cobrando aparte.

- **Qué no cubren:** pagos por adelantado de reservas y Savings Plans, AWS Marketplace (salvo modelos de terceros en Bedrock), Mechanical Turk, servicios profesionales, formación y certificaciones, ni algunos planes de soporte.
- **Organización:** los créditos están en la cuenta que los pidió. Hazla la cuenta de gestión (AWS-03), crea `ringee-prod` y `ringee-staging` como cuentas miembro y deja activado el credit sharing en Billing preferences, también para las cuentas nuevas. Si no, los créditos no cubren lo que corre en ellas. La cuenta de gestión no ejecuta cargas.
- **Budget:** uno de costo bruto, sin descontar créditos, de $210/mes con alertas al 80 y 100 %. Es el ritmo que hace durar los créditos 2 años; un budget que descuenta créditos marcaría $0 y nunca avisaría. Mientras exista el staging, el importe sube al gasto esperado (~$320/mes los dos primeros meses y ~$275 con compromisos) para que no avise todos los meses.

### 5.4 Palancas ya aplicadas

Sin NAT; Graviton; una sola RDS para la app y Temporal; Temporal en ECS en vez de Temporal Cloud; la UI de Temporal apagada; logs con 30 días de retención (la ingesta de CloudWatch, a $0.50/GB, es la sorpresa clásica); lifecycle en ECR; y sin Container Insights al principio.

### 5.5 No incluido

Soporte de AWS (Developer $29/mes, Business desde $100/mes); WAF (~$10/mes si lo añades); y Vercel, que no cambia salvo que hagas la fase 7. El staging no entra en los totales de §5.1: su costo está en §4.9 y su efecto en los créditos, en §5.3.

## 6. Cambios de código antes del corte

Todos se pueden desplegar primero en Railway, donde también mejoran las cosas.

### AWS-06 — El SSE del dialer no aguanta dos réplicas

`SSEBridgeService` es un `Subject` en memoria (`packages/services/src/services/outbound/sse-bridge.service.ts`), y el loop del dialer arranca en cada proceso de la API (`apps/backend/src/app.module.ts:44`). La reclamación del lead es atómica entre instancias (`SKIP LOCKED`), pero el aviso al agente no lo es. Si la instancia que reclama el lead no es la que tiene abierto el SSE del agente, el lead queda asignado y el agente se queda en "Waiting for lead". Pasa con dos tareas y también durante cualquier rolling deploy, porque la tarea vieja y la nueva conviven unos minutos.

Arreglo: emitir y suscribirse a través de `RealtimeBusService` (`packages/platform/src/realtime/realtime-bus.service.ts`), que ya hace pub/sub en Redis para los eventos de usuario. Mientras no esté hecho, `api` corre con una sola tarea.

### AWS-07 — La API no se apaga en orden

`apps/backend/src/main.ts` no llama a `app.enableShutdownHooks()`. Al recibir SIGTERM el proceso muere sin pasar por `DialerOrchestrationService.onModuleDestroy`, que llama a `stopPolling()`; el método existe pero nunca se ejecuta. El orchestrator sí lo hace (`apps/orchestrator/src/main.ts:31`). Hay que añadirlo y esperar a que termine el tick en curso. En ECS: `stopTimeout` de 60 s y deregistration delay de 30 s en el ALB.

### AWS-08 — IP real del cliente detrás del ALB

`apps/backend/src/api/client-ip.ts:14` solo lee `x-real-ip` cuando existe `RAILWAY_ENVIRONMENT_ID`. En AWS cae a `req.ip`, que necesita `TRUST_PROXY_HOPS=1`. Sin ese valor todos los clientes comparten la IP del ALB, y el límite anti card-testing de Stripe (60 intentos por IP cada 10 minutos) y los límites del WebSocket saltarían para todo el mundo a la vez. Si algún día pones CloudFront o el proxy de Cloudflare delante de la API, el valor pasa a 2.

### AWS-09 — Migraciones en git y en el pipeline

`.gitignore:14` sigue excluyendo la carpeta entera, así que ninguna migración está en git y Railway nunca ha ejecutado una: hoy se aplican a mano. Hay que corregir la exclusión, versionar el historial con los mismos nombres que tiene `_prisma_migrations` en producción y comprobarlo con `prisma migrate status` contra un snapshot. Después, el pipeline corre `prisma migrate deploy` como tarea puntual antes del rollout. Los scripts `CONCURRENTLY` de índices sobre `Call` siguen siendo manuales. Las migraciones deben ser aditivas (expand/contract) para que la imagen anterior siga funcionando si hay rollback.

### AWS-10 — Imagen de `chatgpt-mcp`

`apps/chatgpt-app/Dockerfile` usa Node 20 y `--no-frozen-lockfile`, copia el repo entero y ejecuta `tsx` en runtime. Hay que construirla como las del backend: lockfile congelado, JS compilado, Node 22 y ARM64.

### AWS-11 — Comando y puerto

En ECS el comando es `node apps/backend/dist/apps/backend/src/main` con `PORT=3000` (Railway inyectaba 8080). No hay que usar el `CMD` del Dockerfile, que corre `migrate deploy` al arrancar: con N tareas migrarían N a la vez.

### AWS-33 — Un corte de Redis tumba la API y el orchestrator

El cliente compartido (`packages/platform/src/redis/redis.module.ts`) no escuchaba el evento `error`. node-redis lo emite cada vez que se cae la conexión, y Node convierte un `error` sin listener en una excepción no capturada: un reinicio, un failover o un mantenimiento de Valkey mataba todos los procesos a la vez. Reproducido el 4 de noviembre de 2026 con un servidor falso que corta la conexión (`SocketClosedUnexpectedlyError`). Arreglo: `connectRedisClient` (`packages/platform/src/redis/redis-client.ts`) registra el listener, y su test falla sin él.

### AWS-34 — Sin conexión, los comandos de Redis esperan en vez de fallar

node-redis encola los comandos mientras reconecta, sin límite de tiempo. Durante un corte de Valkey, todo lo que toca Redis se queda colgado. El lease de una llamada a la vez está hecho para dejar pasar la llamada si Redis falla (`concurrent-call-guard.service.ts`), pero nunca recibe el error, y el puente SSE (AWS-06) no cae a la entrega local. Con `disableOfflineQueue` el comando falla en ~1 ms (`ClientOfflineError`) y los dos caminos funcionan. Antes de activarlo hay que revisar cada llamador de `RedisService`, porque un corte breve dejaría de esperarse y pasaría a fallar. Con un solo nodo de Valkey, un mantenimiento son unos minutos así.

### Ya está bien (verificado)

- El guard SSRF bloquea 169.254.0.0/16, donde vive el endpoint de metadata de ECS con las credenciales de la tarea (`packages/platform/src/net/public-network.ts:206`). `OUTBOUND_ALLOW_PRIVATE_NETWORK` debe seguir apagado en AWS.
- Los eventos de usuario por WebSocket ya pasan por Redis, el orchestrator maneja SIGTERM con 30 s de gracia y el SSE tiene heartbeat.
- **Pendiente de probar en staging:** la transcripción en vivo cuando el WebSocket de Telnyx y los webhooks de la misma llamada caen en tareas distintas, porque `transcription-media.gateway.ts` guarda las sesiones en un `Map` en memoria.

## 7. Pipeline

- `ringee-infra` (privado) con Terraform, estado en S3 con bloqueo nativo y `plan` en cada PR y push. El `apply` se hace desde una estación con SSO, porque un repo privado no puede exigir revisor sin GitHub Enterprise. Los módulos de postiz-aws son AGPL-3.0, como Ringee: si copias alguno, conserva la licencia y la atribución.
- `deploy-aws.yml` en este repo, por branch (decidido el 4 de noviembre de 2026): un push a `staging` despliega en la cuenta de staging y uno al branch de producción (`main` o un `prod` nuevo, por confirmar) en la de prod. Cada entorno de GitHub solo acepta su branch, y producción además pide tu aprobación. Usa los mismos filtros de rutas que los Watch Paths de Railway:
  1. build de las imágenes que cambiaron para `linux/arm64`, en un runner ARM (sin emular con QEMU);
  2. push a ECR con el SHA como tag;
  3. tarea `migrate` (`prisma migrate deploy`), esperando a que termine bien;
  4. nueva revisión de cada servicio con circuit breaker y rollback automático, esperando a que estén estables;
  5. smoke test de `/api/health`.
- Autenticación por OIDC: un rol de solo lectura para el plan de `ringee-infra` y un rol de deploy para `ringee-app`, que solo acepta su entorno de GitHub (`staging` o `production`, este con revisor). Ninguna clave de AWS en GitHub.
- Rollback: volver a desplegar el SHA anterior, cuya imagen sigue en ECR.
- Deploys sin corte: `api` y `orchestrator` con 100 % mínimo y 200 % máximo (dos workers de Temporal sobre la misma cola conviven bien); `temporal` con 0 % y 100 %, una pausa de segundos que los workers reintentan.

## 8. Seguridad

- Cuentas separadas por entorno, personas entrando por IAM Identity Center con MFA, y ningún usuario IAM ni clave de larga duración.
- CloudTrail de organización, GuardDuty e IAM Access Analyzer desde el primer día.
- Cifrado en reposo en RDS, Valkey, ECR, Secrets Manager y S3 con claves gestionadas por AWS, y TLS en tránsito en todo, incluidos Postgres y Valkey.
- Un rol de tarea y uno de ejecución por servicio, cada uno con acceso solo a sus secretos.
- Escaneo de imágenes en ECR; ECS Exec queda auditado en CloudTrail.
- WAF es opcional al principio, porque la app ya limita los abusos de pagos. Si lo añades: reglas de tasa sobre las rutas de Stripe y las managed rules básicas.
- Staging no debe usar la cuenta de Telnyx de producción: compartirla ya movió un número real a conexiones de desarrollo.

## 9. Observabilidad y control de costos

- Logs en CloudWatch con 30 días de retención (14 para `temporal`).
- Alarmas por SNS a email o Slack: 5xx y latencia p95 del ALB, targets no sanos, tareas corriendo por debajo de las deseadas, CPU, memoria libre, almacenamiento y conexiones de RDS, y memoria y evictions de Valkey.
- Chequeo externo de `https://api.ringee.io/api/health` cada minuto (health check de Route 53 o un servicio de uptime).
- AWS Budgets al 50, 80 y 100 %, Cost Anomaly Detection y etiquetas `Project`, `Env` y `Service` activadas como etiquetas de costo.

## 10. Runbook de corte

Ventana: **de viernes a sábado, 01:00–04:00 (hora de RD)**. En 30 días de métricas, la franja de viernes 22:00 a sábado 06:00 fue la más quieta; el pico va de lunes a jueves entre 12:00 y 16:00. Con 1.4 GB de BD, el corte efectivo debería durar 30–60 minutos; el ensayo (AWS-24) dará la cifra real.

**Por qué el corte empieza sin llamadas activas.** Telnyx reintenta poco un webhook fallido (según su soporte, una vez). Si un `call.hangup` llega con la API apagada, el sweep de llamadas colgadas (`packages/services/src/services/security/stale-call-sweeper.service.ts`) cierra la llamada y libera el slot del usuario, pero ese camino no debita el costo. Stripe y Clerk sí reintentan durante horas o días.

### Días antes

1. **T−14 d:** infraestructura arriba con los servicios en 0 tareas, certificados ACM emitidos y secretos copiados en seco.
2. **T−7 d:** ensayo completo con una copia de la BD (AWS-24): dump, restore, conteos, arranque y pruebas. Se anotan los tiempos y se borra la copia.
3. **T−48 h:** TTL de `api` y `chatgpt` a 60 s; congelar los merges a `main` y desplegar en AWS el mismo commit que corre Railway; avisar a los clientes (email y banner); confirmar quién lee la BD desde fuera (AWS-05).

### La noche del corte

4. Banner de mantenimiento y campañas activas en pausa.
5. **Temporal en Railway:** pausar los 15 schedules con Admin Tools.
6. Esperar a que no quede ningún workflow en curso ni ninguna llamada viva (filas de `Call` en los estados que revisa el sweep). Los periódicos tienen un tope de 8 minutos; el de IA, de 1 h, así que conviene revisar antes que no haya uno corriendo.
7. **Railway:** detener Api, Orchestrator y Temporal. Desde aquí no hay escrituras.
8. **Datos:** desde la tarea `ops` en AWS, `pg_dump -Fc` de la BD principal con `sslmode=require` y `pg_restore --no-owner` en RDS. El dump se guarda cifrado en S3 como punto de rollback.
9. **Verificar:** conteos de filas por tabla contra el origen (con un script), `_prisma_migrations` idéntica, `prisma migrate status` al día y secuencias correctas.
10. **AWS:** arrancan `temporal` y `api`. `orchestrator` sigue en 0 para que ningún schedule (recordatorios con IA, callbacks) haga llamadas antes de decidir.
11. **Prueba antes del DNS:** `curl --resolve api.ringee.io:443:<IP del ALB>` para el health y los endpoints clave, y un navegador con `api.ringee.io` apuntando al ALB en el archivo hosts para el login y las pantallas principales. Lo que el frontend pida desde los servidores de Vercel seguirá yendo a Railway, que está apagado; esos errores se ignoran. **Go/no-go 1.** Si no se sigue, Railway vuelve a arrancar y no se perdió nada.
12. **DNS:** `api.ringee.io` al ALB y el origen de `chatgpt.ringee.io` al ALB. Quitar el dominio de la Api en Railway.
13. `orchestrator` a 1 tarea; los schedules se crean solos.
14. **Pruebas reales:** llamada saliente desde la web (personal y de organización), entrante a un número de prueba (ruteo y recepcionista IA), grabación y transcripción en R2, reenvío de un evento reciente de Stripe desde su panel (es idempotente), webhook de Clerk, conector MCP, extensión, SDK playground, CLI y ChatGPT. **Go/no-go 2.**
15. Quitar el banner, reanudar las campañas y vigilar dos horas: alarmas, logs y entregas fallidas en Telnyx y Stripe.

### Después

16. **Ese mismo día (AWS-27):** desconectar el repo de GitHub de los servicios de Railway y borrar Api, Orchestrator, chatgpt-mcp y los servicios de Temporal. Un push a `main` volvería a desplegar la Api de Railway con el dialer apuntando a la BD vieja, donde las campañas siguen activas: llamadas duplicadas reales.
17. **Reconciliar (AWS-28):** CDRs y grabaciones de Telnyx de la ventana contra la tabla `Call`.
18. Restaurar los TTL. Mantener la BD de Railway apagada 14 días y después borrar el proyecto; el dump de S3 se conserva 30 días.

### Rollback

- **Antes del DNS (paso 11):** volver a arrancar Railway, sin pérdida.
- **Después del DNS:** mejor arreglar hacia adelante. Volver atrás es el mismo procedimiento al revés (dump de RDS a Railway) con otra ventana, porque ya habrá escrituras nuevas en AWS.

## 11. Fase opcional: frontend y blog

Vercel puede quedarse: el frontend habla con `api.ringee.io` por HTTPS, e iad1 está en el mismo metro que us-east-1. Conviene moverlo si la factura de Vercel pasa de ~$50/mes o si quieres todo en una sola cuenta.

- **Frontend:** un servicio ECS `web` con la salida `standalone` que ya genera `apps/frontend/Dockerfile.compose` (2 tareas de 0.5 vCPU / 1 GB, ~$29/mes), detrás del mismo ALB, con CloudFront delante cacheando `/_next/static/*` y lo de `public/`. CloudFront tiene planes de tarifa plana desde noviembre de 2025: Free a $0 y Pro a $15/mes con WAF incluido.
- **Qué cambia:** los `headers` y `rewrites` de `apps/frontend/vercel.json` pasan a `next.config` o a behaviors de CloudFront; las `NEXT_PUBLIC_*` se fijan en el build; `sharp` debe ir en la imagen para optimizar imágenes; y se pierden las previews por PR, que pasa a cubrir el staging.
- **Blog** (Astro estático): S3 con CloudFront en el plan Free. `getringee.com`: una redirección con CloudFront Functions.
- `docs.ringee.io` sigue en Mintlify.

## 12. Calendario (a tiempo parcial)

| Semana  | Qué                                                                        |
| ------- | -------------------------------------------------------------------------- |
| 1       | Fase 0; pedir créditos; Terraform de red, ECR, RDS, Valkey, ALB y secretos |
| 2       | Fase 1 en código (AWS-06…11), desplegada primero en Railway                |
| 3       | Servicios ECS, pipeline y staging; pruebas con 2 tareas de API             |
| 4       | Ensayo del corte y ajuste del runbook                                      |
| 5       | Corte (viernes por la noche) y dos semanas de vigilancia                   |
| Después | Compromisos a los 30–60 días; fase 7 si aplica                             |

## 13. Decisiones abiertas

1. **Nivel:** resuelto el 4 de noviembre de 2026, B desde el primer día con un solo nodo de Valkey (§5.1). Cambiar de nivel no tiene downtime en ningún sentido; lo único que ata son los compromisos (§5.2).
2. **Frontend:** ¿cuánto pagas hoy en Vercel? Sin ese dato, recomiendo dejarlo para la fase 7.
3. **Staging:** resuelto el 4 de noviembre de 2026, al menos 6 meses (§4.9). Sigue pendiente su cuenta de Telnyx, desde el 15 de octubre de 2026.
4. **Quién lee la BD principal desde fuera de Railway** (AWS-05).
5. **Región:** us-east-1 (recomendada) o us-east-2.
6. **Créditos:** resuelto, $5,000 a 2 años. Con ese presupuesto cabe el nivel B con compromisos sin pago inicial; el staging permanente no (§5.3).

## Fuentes

- Postiz: [README de postiz-aws](https://github.com/gitroomhq/postiz-aws) y [runbook de migración](https://github.com/gitroomhq/postiz-aws/blob/main/docs/migration-runbook.md).
- AWS: [precios de Fargate](https://aws.amazon.com/fargate/pricing/), [RDS db.t4g.medium](https://www.bytebase.com/dbcost/rds/instance/db.t4g.medium/), [precios de ElastiCache](https://upstash.com/blog/aws-elasticache-pricing-explained-2026-full-cost-breakdown), [planes de tarifa plana de CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html), [Database Savings Plans](https://aws.amazon.com/about-aws/whats-new/2025/12/database-savings-plans-savings) y [su alcance](https://aws.amazon.com/savingsplans/database-pricing/), [reservas de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithReservedDBInstances.html), [activar o quitar Multi-AZ](https://repost.aws/knowledge-center/rds-convert-single-az-multi-az), [cambio de disponibilidad de App Runner](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html), [créditos de Activate](https://aws.amazon.com/aws-startups/learn/everything-you-need-to-know-about-aws-activate-credits/), [créditos en una organización](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/useconsolidatedbilling-credits.html) y [preferencias de credit sharing](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/billing-pref.html).
- [Precios de Railway](https://docs.railway.com/pricing/plans), [precios de Temporal Cloud](https://docs.temporal.io/cloud/pricing), [webhooks de voz de Telnyx](https://developers.telnyx.com/docs/voice/programmable-voice/voice-api-webhooks) y [reintentos de webhooks de Telnyx](https://support.telnyx.com/en/articles/4334722-how-to-leverage-webhooks).
- Medido: API GraphQL de Railway (`metrics`, `estimatedUsage`, `serviceInstance`; de las variables solo se leyeron los nombres), DNS público y código en `a2b17ad0`.
