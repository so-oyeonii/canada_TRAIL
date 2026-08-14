-- This file holds one statement on purpose. apply_migration wraps a migration in
-- a transaction, and a value added by ALTER TYPE cannot be used in the same
-- transaction that added it. 0012 reads 'sealed' in a trigger body, so the value
-- has to be committed by an earlier file.
--
-- A sealed bag is the partner attaching a Trail tag. It does not move custody on
-- its own — the timeline folds it into "Dropped off" — but without the row there
-- is no record of which tag went on which bag, and the handoff comparison at the
-- hotel has nothing to compare against.
alter type public.transfer_event add value if not exists 'sealed' after 'dropped_off';
