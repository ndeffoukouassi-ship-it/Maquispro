// Messages lisibles et délais locaux anti-clics répétés.
// Les délais sont des garde-fous d'interface et non les quotas réels de Supabase.
export const EMAIL_RETRY_MINUTES=5;
export const EMAIL_LIMIT_MINUTES=60;
export function emailRateLimit(error){
  const msg=String(error?.message||'').toLowerCase();
  const code=String(error?.code||'').toLowerCase();
  return error?.status===429||code==='over_email_send_rate_limit'||
    msg.includes('email rate limit')||msg.includes('too many requests')||
    msg.includes('you can only request this after');
}
export function authMessage(error){
  if(emailRateLimit(error))
    return 'Supabase a atteint sa limite d’envoi de courriels. Ne redemande pas immédiatement un lien. Une nouvelle tentative sera possible plus tard, après la réinitialisation du quota.';
  const code=String(error?.code||'').toLowerCase();
  const msg=String(error?.message||'').toLowerCase();
  if(code==='otp_expired'||msg.includes('one-time token not found')||msg.includes('token has expired'))
    return 'Ce lien est expiré ou a déjà été utilisé. Il faut un nouveau lien, une fois le quota d’e-mails rétabli.';
  if(code==='invalid_credentials'||msg.includes('invalid login credentials'))
    return 'E-mail ou mot de passe non reconnu. Vérifie les identifiants. Si ton adresse n’est pas encore confirmée, utilise d’abord un lien de confirmation valide.';
  if(msg.includes('email not confirmed')||code==='email_not_confirmed')
    return 'Ton adresse e-mail n’est pas encore confirmée. Ouvre le dernier lien valide reçu de Supabase.';
  return null;
}
export function waitLabel(ms){
  const minutes=Math.ceil(Math.max(0,ms)/60000);
  if(minutes===0)return '';
  return minutes===1?'1 minute':minutes+' minutes';
}
