-- 0023 · the catalogue the recommendation feed reads, and the honesty rules around it.
--
-- `products` has existed since 0001 with zero rows and zero queries. The feed the
-- wireframes ask for (`Popular Souvenirs in Toronto!`, `Nearby Stores`, `Made for
-- {city}`) needs three things at once: columns to sort and filter on, a seed, and a way
-- to say where each row came from.
--
-- The seed's rule, decided in docs/plans/G3-trips-discovery.md §5:
--
--   store identity  real name, real address, real coordinates. The whole point of the
--                   feature is a seven-minute walk that exists. Sending a traveller to
--                   `Toronto Local Goods` is a bigger lie than naming the shop.
--   product names   generalised. We do not know that shop's stock, and naming an SKU
--                   under a real storefront is a claim about their inventory.
--   prices          `price_is_estimate` -> the card draws `~ CAD $58`. A column, so the
--                   label cannot drift from the data.
--   partner flag    never on a real name. `is_partner_point = true` is an assertion about
--                   a third party who has agreed to nothing, and "Sample" does not read
--                   as "this business has never heard of us". `partner_agreement_ref`
--                   plus a CHECK is what stops it.
--   photographs     all null. We have no licensed photography, and a stock photo under a
--                   real shop's name is one more claim about that shop.

-- -- preference tags -----------------------------------------------------------
-- The two enums were written in 0025 (G4, `plans`), which the coordinator numbered after
-- this file. `products.preference_tags` below references `public.preference_tag`, so the
-- definition moves here and 0025 owns the `plans` columns only. 0025's own header says to
-- do exactly this if the numbering ever put the catalogue first. One definition, one file.
do $$ begin
  create type public.preference_tag as enum (
    'local', 'handmade', 'not_touristy', 'easy_to_pack',
    'edible', 'useful', 'keepsake', 'budget_friendly'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.route_tag as enum ('short_walk', 'moderate_walk', 'any_walk');
exception when duplicate_object then null; end $$;

-- -- catalogue columns ---------------------------------------------------------
alter table public.products
  add column if not exists subtitle          text     not null default '',
  add column if not exists sort_order        smallint not null default 100,
  add column if not exists active            boolean  not null default true,
  add column if not exists price_is_estimate boolean  not null default true,
  add column if not exists source_note       text     not null default '',
  add column if not exists preference_tags   public.preference_tag[] not null default '{}';

-- `route_tag` gets no column here. It is a property of the walk between stops, read from
-- `stops.walk_minutes` (<=8 / <=20 / unlimited), and a column on `products` would filter
-- nothing -- which is the rule 0025 states for what may become a tag at all.

create unique index if not exists products_city_name_uidx on public.products (city, name);
create index if not exists products_store_idx on public.products (store_id);
create index if not exists products_feed_idx  on public.products (city, sort_order) where active;
create index if not exists products_preference_tags_idx on public.products using gin (preference_tags);
-- `products_city_idx (city, category)` from 0001 stays: `Made for {city}` groups the feed
-- by category, which `products_feed_idx (city, sort_order)` cannot answer.

comment on column public.products.price_is_estimate is
  'True when Trail estimated the price rather than the store quoting it. The card renders ~ in front of the amount from this column, never from copy.';
comment on column public.products.source_note is
  'Where the row came from and what it does not claim. Read out as the accessible description of the Sample chip, so the chip is explainable instead of decorative.';
comment on column public.products.preference_tags is
  'Closed-enum filters for the recommendation feed. Empty means the row is filtered out by every chip -- an unfilled column turns `Not touristy` into decoration.';

-- -- a partner flag is a claim about somebody else ------------------------------
alter table public.stores add column if not exists partner_agreement_ref text;
update public.stores set partner_agreement_ref = 'sample:no-agreement'
 where is_partner_point and partner_agreement_ref is null;
alter table public.stores drop constraint if exists stores_partner_needs_agreement;
alter table public.stores add constraint stores_partner_needs_agreement
  check (not is_partner_point or partner_agreement_ref is not null);

comment on column public.stores.partner_agreement_ref is
  'What makes this a drop-off partner. `sample:` prefix means no agreement exists and the screen has to say so (G5 draws `Sample partner - no agreement in place`).';

-- -- Toronto: five real storefronts ---------------------------------------------
-- Two of them are already here from 0011 as drop-off partners. The three added below are
-- not partner points: they are shops a traveller can walk into, and nothing more is
-- claimed about them.
insert into public.stores (city, name, address, area, lat, lng, hours_note, photo_url, is_partner_point, source)
select v.city, v.name, v.address, v.area, v.lat, v.lng, v.hours_note, null, false, 'sample'::public.data_source
from (values
  ('Toronto', 'Kid Icarus',          '205 Augusta Ave',   'Kensington Market',    43.6547, -79.4014, 'Check current hours before you walk over.'),
  ('Toronto', 'Drake General Store', '1151 Queen St W',   'West Queen West',      43.6430, -79.4243, 'Check current hours before you walk over.'),
  ('Toronto', 'Bergo Designs',       '28 Tank House Ln',  'Distillery District',  43.6503, -79.3596, 'Check current hours before you walk over.')
) as v(city, name, address, area, lat, lng, hours_note)
where not exists (select 1 from public.stores s where s.city = v.city and s.name = v.name);

-- -- sixteen generalised products ------------------------------------------------
-- Names describe a kind of thing, not a product on a shelf. Prices are Trail's estimate
-- and every row says so twice: in `price_is_estimate` and in `source_note`.
insert into public.products (
  store_id, city, name, subtitle, category, price_cents, currency, handling, weight_grams,
  photo_url, tags, preference_tags, sort_order, active, price_is_estimate, source_note, source
)
select s.id, 'Toronto', v.name, v.subtitle, v.category, v.price_cents, 'CAD', v.handling::public.handling_type,
       v.weight_grams, null, '{}'::text[], v.preference_tags::public.preference_tag[], v.sort_order, true, true,
       'Public storefront listing, Aug 2026. Price estimated by Trail; not quoted by the store.',
       'sample'::public.data_source
from (values
  ('Toronto prints, boxed flat',        'Flat box, cabin-safe',      'Kid Icarus',          'Art & stationery', 3800,  'Fragile',  600,  10, '{local,handmade,not_touristy,easy_to_pack,keepsake}'),
  ('Letterpress card set',              'Small paper gift',          'Kid Icarus',          'Art & stationery', 2200,  'Standard', 200,  20, '{local,handmade,easy_to_pack,budget_friendly}'),
  ('Hand-printed tote',                 'Folds into a bag',          'Kid Icarus',          'Art & stationery', 3200,  'Standard', 300,  30, '{local,handmade,useful,easy_to_pack}'),
  ('Ontario-made ceramic mug',          'Needs wrapping',            'Bergo Designs',       'Home & design',    5800,  'Fragile',  700,  40, '{local,handmade,useful,keepsake}'),
  ('Small stoneware serving dish',      'Heavy for its size',        'Bergo Designs',       'Home & design',    7400,  'Fragile',  900,  50, '{local,handmade,keepsake}'),
  ('Enamel kitchen utensil',            'Everyday kitchen gift',     'Bergo Designs',       'Home & design',    2600,  'Standard', 250,  60, '{useful,easy_to_pack,budget_friendly}'),
  ('Folding travel candle',             'Travel-sized',              'Bergo Designs',       'Home & design',    4200,  'Standard', 400,  70, '{easy_to_pack,keepsake}'),
  ('Toronto-designed pin set',          'Pocket-sized keepsake',     'Spacing Store',       'Art & stationery', 1800,  'Standard', 90,   80, '{local,not_touristy,easy_to_pack,budget_friendly}'),
  ('Transit map notebook',              'Useful on the trip too',    'Spacing Store',       'Art & stationery', 2400,  'Standard', 320,  90, '{local,useful,easy_to_pack,budget_friendly}'),
  ('City neighbourhood print',          'Frame it at home',          'Spacing Store',       'Art & stationery', 4400,  'Fragile',  500,  100, '{local,not_touristy,keepsake}'),
  ('Ontario maple syrup, small tin',    'Sealed tin, checked bag',   'Blue Banana Market',  'Food & treats',    2100,  'Standard', 550,  110, '{local,edible,easy_to_pack,budget_friendly}'),
  ('Local roaster coffee beans',        'Whole bean or ground',      'Blue Banana Market',  'Food & treats',    2300,  'Standard', 340,  120, '{local,edible,not_touristy,easy_to_pack}'),
  ('Ontario honey, jar',                'Glass jar, wrap it',        'Blue Banana Market',  'Food & treats',    1600,  'Fragile',  500,  130, '{local,edible,budget_friendly}'),
  ('Woven market basket',               'Bulky, packs empty',        'Blue Banana Market',  'Home & design',    4900,  'Standard', 800,  140, '{local,handmade,useful,not_touristy}'),
  ('Canadian-made wool scarf',          'Light, packs small',        'Drake General Store', 'Home & design',    6800,  'Standard', 350,  150, '{local,useful,easy_to_pack,keepsake}'),
  ('Souvenir sweatshirt, city name',    'Sizes vary by shop',        'Drake General Store', 'Home & design',    9200,  'Standard', 700,  160, '{easy_to_pack,useful}')
) as v(name, subtitle, store_name, category, price_cents, handling, weight_grams, sort_order, preference_tags)
join public.stores s on s.city = 'Toronto' and s.name = v.store_name
on conflict (city, name) do nothing;

-- No new policy and no new grant. 0002 already gives `authenticated` SELECT on both
-- tables with `using (true)`, and adding a second permissive policy is what the advisor's
-- `multiple_permissive_policies` finding is for. INSERT and UPDATE stay ungranted: the
-- catalogue is read-only to every browser.
