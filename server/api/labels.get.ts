import { supabase } from '#server/utils/supabase';

export default defineEventHandler(async () => {
  const { data, error } = await supabase.rpc('get_labels');

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return data;
});
