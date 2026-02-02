import { supabase } from '#server/utils/supabase';

export default defineEventHandler(async () => {
  const { data, error } = await supabase.rpc('sovereignt_entities');

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return data;
});
