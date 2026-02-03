import { supabase } from '#server/utils/supabase';

export default cachedEventHandler(async () => {
  const { data, error } = await supabase.rpc('get_labels');

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return data;
}, {
  maxAge: 60 * 60 * 24 * 30,
  name: 'labels',
});
