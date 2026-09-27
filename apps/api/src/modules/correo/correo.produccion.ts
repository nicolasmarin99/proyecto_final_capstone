/**
 * HUECO: transporte de producción. Todavía no implementado, a propósito.
 *
 * Este archivo no exporta una clase que falle al usarse. Un transporte que
 * lanza en tiempo de ejecución es peor que no tenerlo: la aplicación arranca,
 * parece sana y recién falla cuando alguien intenta recuperar su cuenta. Por
 * eso "produccion" ni siquiera es un valor aceptado por CORREO_TRANSPORTE en
 * env.ts, y la API no levanta si se configura así.
 *
 * Lo que tiene que cumplir la implementación cuando llegue el momento:
 *
 * 1. Implementar EnviadorCorreo de correo.tipos.ts. Nada fuera de este módulo
 *    debería cambiar: ese es el punto del adaptador.
 * 2. Tomar la credencial del proveedor desde env.ts, nunca del código, y que
 *    env.ts la exija sin valor por defecto, igual que JWT_SECRET.
 * 3. Mantener un tope de espera, como hace EnviadorSmtp. Un proveedor lento no
 *    puede dejar colgada la petición HTTP que originó el correo.
 * 4. Dominio remitente con SPF, DKIM y DMARC configurados. Sin eso los correos
 *    de verificación terminan en spam y la funcionalidad no sirve de nada,
 *    aunque el código esté correcto.
 * 5. Reintentos y cola. Con un proveedor real conviene sacar el envío del
 *    camino de la petición: hoy se espera el envío dentro del request porque
 *    Mailpit responde en milisegundos, y eso deja de ser razonable cuando hay
 *    una red de por medio.
 * 6. No registrar el cuerpo de los correos en los logs del proveedor ni en los
 *    propios: llevan enlaces que son credenciales de un solo uso.
 *
 * Candidatos evaluados y por qué se dejó abierto: Resend y Postmark tienen la
 * integración más simple; Amazon SES es más barato a volumen pero exige salir
 * del entorno de pruebas del servicio. La decisión depende de dónde quede
 * alojada la API, así que se toma cuando se defina el despliegue definitivo.
 */

export {};
