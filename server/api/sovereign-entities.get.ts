import { supabase } from '#server/utils/supabase';

export default cachedEventHandler(async () => {
  const { data, error } = await supabase.rpc('get_sovereign_entities');

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return data;
}, {
  maxAge: 60 * 60 * 24 * 30,
  staleMaxAge: 60 * 60 * 24,
  name: 'sovereign_entities',
});
