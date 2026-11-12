-- Animated demonstrations for the exercise library (source: ExerciseDB free catalogue).
-- Every match below was checked by eye against the catalogue's animation before being written here.

ALTER TABLE exercises ADD CONSTRAINT exercises_demo_ck CHECK (
  (demo_url IS NULL OR demo_url ~ '^https://static\.exercisedb\.dev/media/[A-Za-z0-9_-]{1,40}\.gif$')
  AND (demo_external_id IS NULL OR demo_external_id ~ '^[A-Za-z0-9_-]{1,40}$')
  AND cardinality(aliases) <= 30
);
--> statement-breakpoint

-- Comparison key for exercise names: no accents, no case, no punctuation, no copy suffix.
CREATE FUNCTION app_exercise_key(name text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$
    SELECT regexp_replace(
      btrim(regexp_replace(translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', ' ', 'g')),
      ' (copia|minha)$', '')
  $$;
--> statement-breakpoint
CREATE INDEX exercises_platform_key_idx ON exercises (app_exercise_key(name)) WHERE workspace_id IS NULL;
--> statement-breakpoint

-- The platform exercise whose demonstration fits a trainer's exercise: same name, a known alias,
-- or (failing those) the exercise it was copied from. NULL when nothing is reliable.
CREATE FUNCTION app_demo_source(exercise_name text, source_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT p.id FROM exercises p
    WHERE p.workspace_id IS NULL AND p.archived_at IS NULL AND p.demo_url IS NOT NULL
      AND (app_exercise_key(p.name) = app_exercise_key(exercise_name)
           OR app_exercise_key(exercise_name) = ANY (p.aliases)
           OR p.id = source_id)
    ORDER BY (app_exercise_key(p.name) = app_exercise_key(exercise_name)) DESC,
             (app_exercise_key(exercise_name) = ANY (p.aliases)) DESC
    LIMIT 1
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_demo_source(text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_demo_source(text, uuid) TO cadencia_app;
--> statement-breakpoint

-- Gives every trainer's exercise the demonstration of its platform equivalent, and marks the
-- ones without a reliable equivalent for review. Safe to run again: only rows that change are written.
CREATE FUNCTION app_propagate_exercise_demos() RETURNS TABLE (matched integer, unmatched integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF NOT (SELECT app_is_platform_admin()) AND current_setting('app.is_system', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    WITH resolved AS (
      SELECT e.id, app_demo_source(e.name, e.source_exercise_id) AS source
      FROM exercises e WHERE e.workspace_id IS NOT NULL
    ), wanted AS (
      SELECT r.id, p.demo_external_id, p.demo_url,
             (CASE WHEN p.id IS NULL THEN 'unmatched' ELSE 'matched' END)::exercise_demo_status AS status
      FROM resolved r LEFT JOIN exercises p ON p.id = r.source
    )
    UPDATE exercises e
    SET demo_external_id = w.demo_external_id, demo_url = w.demo_url, demo_status = w.status, demo_synced_at = now()
    FROM wanted w
    WHERE e.id = w.id
      AND (e.demo_url IS DISTINCT FROM w.demo_url OR e.demo_external_id IS DISTINCT FROM w.demo_external_id OR e.demo_status IS DISTINCT FROM w.status);
    RETURN QUERY
      SELECT count(*) FILTER (WHERE e.demo_status = 'matched')::integer, count(*) FILTER (WHERE e.demo_status = 'unmatched')::integer
      FROM exercises e WHERE e.workspace_id IS NOT NULL AND e.archived_at IS NULL;
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_propagate_exercise_demos() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_propagate_exercise_demos() TO cadencia_app;
--> statement-breakpoint

-- Names of trainers' exercises still without a demonstration, grouped, for the admin's review.
-- Only the name and how many times it appears: nothing about who created it.
CREATE FUNCTION app_unmatched_exercise_names() RETURNS TABLE (name_key text, sample text, uses integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT app_exercise_key(e.name), min(e.name), count(*)::integer
    FROM exercises e
    WHERE (SELECT app_is_platform_admin())
      AND e.workspace_id IS NOT NULL AND e.archived_at IS NULL AND e.demo_status = 'unmatched'
      AND e.video_asset_id IS NULL AND e.video_url IS NULL
    GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 200
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_unmatched_exercise_names() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_unmatched_exercise_names() TO cadencia_app;
--> statement-breakpoint

-- Sync history: platform admins only.
ALTER TABLE demo_sync_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY demo_sync_runs_admin ON demo_sync_runs FOR ALL TO cadencia_app
  USING ((SELECT app_is_platform_admin())) WITH CHECK ((SELECT app_is_platform_admin()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON demo_sync_runs FROM cadencia_app;
--> statement-breakpoint

-- 1. Demonstrations for the platform exercises that already exist.
CREATE TEMP TABLE _demo (name text, external_id text, url text);
--> statement-breakpoint
INSERT INTO _demo VALUES
  ('Supino reto com barra', 'EIeI8Vf', 'https://static.exercisedb.dev/media/EIeI8Vf.gif'),
  ('Supino reto com halteres', 'SpYC0Kp', 'https://static.exercisedb.dev/media/SpYC0Kp.gif'),
  ('Supino inclinado com halteres', 'ns0SIbU', 'https://static.exercisedb.dev/media/ns0SIbU.gif'),
  ('Supino declinado com barra', 'GrO65fd', 'https://static.exercisedb.dev/media/GrO65fd.gif'),
  ('Crucifixo com halteres', 'yz9nUhF', 'https://static.exercisedb.dev/media/yz9nUhF.gif'),
  ('Crossover na polia', '0CXGHya', 'https://static.exercisedb.dev/media/0CXGHya.gif'),
  ('Peck deck', 'v3xmPAR', 'https://static.exercisedb.dev/media/v3xmPAR.gif'),
  ('Flexão de braço', 'I4hDWkc', 'https://static.exercisedb.dev/media/I4hDWkc.gif'),
  ('Puxada frontal', 'eYnzaCm', 'https://static.exercisedb.dev/media/eYnzaCm.gif'),
  ('Remada baixa na polia', 'fUBheHs', 'https://static.exercisedb.dev/media/fUBheHs.gif'),
  ('Remada curvada com barra', 'eZyBC3j', 'https://static.exercisedb.dev/media/eZyBC3j.gif'),
  ('Remada unilateral com halter', 'C0MA9bC', 'https://static.exercisedb.dev/media/C0MA9bC.gif'),
  ('Remada cavalinho', 'aaXr7ld', 'https://static.exercisedb.dev/media/aaXr7ld.gif'),
  ('Pulldown com braços estendidos', 'x69MAlq', 'https://static.exercisedb.dev/media/x69MAlq.gif'),
  ('Barra fixa', 'lBDjFxJ', 'https://static.exercisedb.dev/media/lBDjFxJ.gif'),
  ('Desenvolvimento com halteres', 'znQUdHY', 'https://static.exercisedb.dev/media/znQUdHY.gif'),
  ('Desenvolvimento militar com barra', 'Kyd9Rz5', 'https://static.exercisedb.dev/media/Kyd9Rz5.gif'),
  ('Elevação lateral', 'DsgkuIt', 'https://static.exercisedb.dev/media/DsgkuIt.gif'),
  ('Elevação frontal', '3eGE2JC', 'https://static.exercisedb.dev/media/3eGE2JC.gif'),
  ('Crucifixo inverso', 'v1qBec9', 'https://static.exercisedb.dev/media/v1qBec9.gif'),
  ('Face pull', 'ZfyAGhK', 'https://static.exercisedb.dev/media/ZfyAGhK.gif'),
  ('Rosca direta com barra', '25GPyDY', 'https://static.exercisedb.dev/media/25GPyDY.gif'),
  ('Rosca alternada com halteres', 'BU15nH4', 'https://static.exercisedb.dev/media/BU15nH4.gif'),
  ('Rosca martelo', '2NpxjC1', 'https://static.exercisedb.dev/media/2NpxjC1.gif'),
  ('Rosca Scott', 'qOgPVf6', 'https://static.exercisedb.dev/media/qOgPVf6.gif'),
  ('Rosca concentrada', 'gvsWLQw', 'https://static.exercisedb.dev/media/gvsWLQw.gif'),
  ('Tríceps na polia', '3ZflifB', 'https://static.exercisedb.dev/media/3ZflifB.gif'),
  ('Tríceps francês com halter', 'kont8Ut', 'https://static.exercisedb.dev/media/kont8Ut.gif'),
  ('Tríceps testa', 'h8LFzo9', 'https://static.exercisedb.dev/media/h8LFzo9.gif'),
  ('Mergulho no banco', 'RrLske5', 'https://static.exercisedb.dev/media/RrLske5.gif'),
  ('Mergulho nas paralelas', 'X6C6i5Y', 'https://static.exercisedb.dev/media/X6C6i5Y.gif'),
  ('Rosca de punho', '6kSxYnw', 'https://static.exercisedb.dev/media/6kSxYnw.gif'),
  ('Rosca inversa', 'xNrS20v', 'https://static.exercisedb.dev/media/xNrS20v.gif'),
  ('Caminhada do fazendeiro', 'qPEzJjA', 'https://static.exercisedb.dev/media/qPEzJjA.gif'),
  ('Prancha lateral', 'RKjH6Lt', 'https://static.exercisedb.dev/media/RKjH6Lt.gif'),
  ('Abdominal supra', 'TFqbd8t', 'https://static.exercisedb.dev/media/TFqbd8t.gif'),
  ('Abdominal bicicleta', '1ZFqTDN', 'https://static.exercisedb.dev/media/1ZFqTDN.gif'),
  ('Elevação de pernas', 'WhuFnR7', 'https://static.exercisedb.dev/media/WhuFnR7.gif'),
  ('Abdominal na polia', 'WW95auq', 'https://static.exercisedb.dev/media/WW95auq.gif'),
  ('Agachamento livre', 'qXTaZnJ', 'https://static.exercisedb.dev/media/qXTaZnJ.gif'),
  ('Agachamento goblet', 'yn8yg1r', 'https://static.exercisedb.dev/media/yn8yg1r.gif'),
  ('Agachamento búlgaro', 'qx4fgX7', 'https://static.exercisedb.dev/media/qx4fgX7.gif'),
  ('Agachamento hack', 'Qa55kX1', 'https://static.exercisedb.dev/media/Qa55kX1.gif'),
  ('Leg press 45', '10Z2DXU', 'https://static.exercisedb.dev/media/10Z2DXU.gif'),
  ('Cadeira extensora', 'my33uHU', 'https://static.exercisedb.dev/media/my33uHU.gif'),
  ('Afundo', 'RRWFUcw', 'https://static.exercisedb.dev/media/RRWFUcw.gif'),
  ('Levantamento terra romeno', 'wQ2c4XD', 'https://static.exercisedb.dev/media/wQ2c4XD.gif'),
  ('Stiff com halteres', '5eLRITT', 'https://static.exercisedb.dev/media/5eLRITT.gif'),
  ('Mesa flexora', '17lJ1kr', 'https://static.exercisedb.dev/media/17lJ1kr.gif'),
  ('Cadeira flexora', 'Zg3XY7P', 'https://static.exercisedb.dev/media/Zg3XY7P.gif'),
  ('Elevação pélvica', 'qg2PGl6', 'https://static.exercisedb.dev/media/qg2PGl6.gif'),
  ('Ponte de glúteos', 'u0cNiij', 'https://static.exercisedb.dev/media/u0cNiij.gif'),
  ('Coice na polia', 'Kpajagk', 'https://static.exercisedb.dev/media/Kpajagk.gif'),
  ('Abdução de quadril na máquina', 'CHpahtl', 'https://static.exercisedb.dev/media/CHpahtl.gif'),
  ('Panturrilha em pé', 'ykUOVze', 'https://static.exercisedb.dev/media/ykUOVze.gif'),
  ('Panturrilha sentado', 'bOOdeyc', 'https://static.exercisedb.dev/media/bOOdeyc.gif'),
  ('Panturrilha no leg press', 'ykHcWme', 'https://static.exercisedb.dev/media/ykHcWme.gif'),
  ('Levantamento terra', 'ila4NZS', 'https://static.exercisedb.dev/media/ila4NZS.gif'),
  ('Burpee', 'dK9394r', 'https://static.exercisedb.dev/media/dK9394r.gif'),
  ('Kettlebell swing', 'UHJlbu3', 'https://static.exercisedb.dev/media/UHJlbu3.gif'),
  ('Thruster', 'f7Y9eDZ', 'https://static.exercisedb.dev/media/f7Y9eDZ.gif'),
  ('Esteira', 'y5p0H8a', 'https://static.exercisedb.dev/media/y5p0H8a.gif'),
  ('Bicicleta ergométrica', 'H1PESYI', 'https://static.exercisedb.dev/media/H1PESYI.gif');
--> statement-breakpoint
UPDATE exercises e SET demo_external_id = d.external_id, demo_url = d.url, demo_status = 'matched', demo_synced_at = now()
FROM _demo d WHERE e.workspace_id IS NULL AND e.archived_at IS NULL AND lower(e.name) = lower(d.name);
--> statement-breakpoint
DROP TABLE _demo;
--> statement-breakpoint

-- 2. New platform exercises, each with its demonstration.
CREATE TEMP TABLE _new (name text, muscle_group text, secondary text, equipment text, difficulty text, description text, instructions text, external_id text, url text);
--> statement-breakpoint
INSERT INTO _new VALUES
  ('Supino inclinado com barra', 'chest', '{shoulders,triceps}', 'Barra e banco inclinado', 'intermediate', 'Supino com barra no banco inclinado, com ênfase na parte superior do peitoral.', 'Deite no banco inclinado entre 30 e 45 graus e segure a barra pouco além da largura dos ombros.
Desça a barra com controle até a parte de cima do peito.
Empurre até estender os cotovelos, mantendo as escápulas apoiadas no banco.', '3TZduzM', 'https://static.exercisedb.dev/media/3TZduzM.gif'),
  ('Supino declinado com halteres', 'chest', '{triceps,shoulders}', 'Halteres e banco declinado', 'intermediate', 'Supino com halteres no banco declinado, com ênfase na parte inferior do peitoral.', 'Prenda os pés no banco declinado e deite com um halter em cada mão.
Desça os halteres ao lado da parte de baixo do peito.
Empurre para cima até quase estender os cotovelos.', 'DwhEmmE', 'https://static.exercisedb.dev/media/DwhEmmE.gif'),
  ('Crucifixo inclinado com halteres', 'chest', '{shoulders}', 'Halteres e banco inclinado', 'beginner', 'Abertura dos braços no banco inclinado, para a parte superior do peitoral.', 'Deite no banco inclinado com os halteres acima do peito e os cotovelos levemente flexionados.
Abra os braços em arco até sentir o peitoral alongar.
Volte pelo mesmo caminho, aproximando os halteres no topo.', 'ESOd5Pl', 'https://static.exercisedb.dev/media/ESOd5Pl.gif'),
  ('Supino na máquina', 'chest', '{triceps,shoulders}', 'Máquina de supino', 'beginner', 'Supino sentado em máquina, com trajetória guiada.', 'Ajuste o banco para as mãos ficarem na altura do peito e apoie as costas.
Empurre as alças à frente até quase estender os cotovelos.
Volte devagar, sem deixar as placas baterem.', 'DOoWcnA', 'https://static.exercisedb.dev/media/DOoWcnA.gif'),
  ('Flexão inclinada', 'chest', '{triceps,shoulders}', 'Banco ou caixa', 'beginner', 'Flexão com as mãos apoiadas em um banco, mais leve que a flexão no chão.', 'Apoie as mãos no banco, um pouco além da largura dos ombros, corpo alinhado.
Desça o peito em direção ao banco, cotovelos a cerca de 45 graus do tronco.
Empurre até estender os braços.', 'B1EVP9F', 'https://static.exercisedb.dev/media/B1EVP9F.gif'),
  ('Flexão declinada', 'chest', '{shoulders,triceps,core}', 'Banco', 'intermediate', 'Flexão com os pés apoiados em um banco, que aumenta o trabalho da parte superior do peitoral.', 'Apoie os pés no banco e as mãos no chão, corpo alinhado.
Desça até o peito quase tocar o chão.
Empurre o chão até estender os braços, sem deixar o quadril cair.', 'i5cEhka', 'https://static.exercisedb.dev/media/i5cEhka.gif'),
  ('Pullover com halter', 'chest', '{back,triceps}', 'Halter e banco', 'intermediate', 'Movimento em arco com o halter acima da cabeça, deitado no banco.', 'Deite no banco e segure um halter com as duas mãos acima do peito.
Leve o halter para trás da cabeça em arco, cotovelos levemente flexionados.
Volte pelo mesmo caminho até a posição inicial.', '9XjtHvS', 'https://static.exercisedb.dev/media/9XjtHvS.gif'),
  ('Mergulho para peitoral', 'chest', '{triceps,shoulders}', 'Barras paralelas', 'advanced', 'Mergulho nas paralelas com o tronco inclinado à frente, com ênfase no peitoral.', 'Suba nas paralelas com os braços estendidos e incline o tronco à frente.
Desça flexionando os cotovelos até sentir o peitoral alongar.
Empurre até estender os braços, mantendo a inclinação.', '9WTm7dq', 'https://static.exercisedb.dev/media/9WTm7dq.gif'),
  ('Remada curvada com halteres', 'back', '{biceps,core}', 'Halteres', 'intermediate', 'Remada com o tronco inclinado, usando um halter em cada mão.', 'Com um halter em cada mão, flexione levemente os joelhos e incline o tronco à frente com a coluna neutra.
Puxe os halteres em direção à cintura, cotovelos próximos ao corpo.
Desça devagar até estender os braços.', 'BJ0Hz5L', 'https://static.exercisedb.dev/media/BJ0Hz5L.gif'),
  ('Remada na máquina', 'back', '{biceps,forearms}', 'Máquina de remada', 'beginner', 'Remada sentada em máquina, com o peito apoiado.', 'Ajuste o banco e apoie o peito no encosto, braços estendidos nas alças.
Puxe as alças levando os cotovelos para trás e aproximando as escápulas.
Volte devagar até estender os braços.', '7I6LNUG', 'https://static.exercisedb.dev/media/7I6LNUG.gif'),
  ('Remada alta na máquina', 'back', '{biceps,shoulders}', 'Máquina de remada alta', 'beginner', 'Puxada em máquina articulada, de cima para baixo e para trás.', 'Sente com o peito apoiado e segure as alças acima da cabeça.
Puxe as alças para baixo e para trás, levando os cotovelos junto ao corpo.
Volte devagar até estender os braços.', 'nZZZy9m', 'https://static.exercisedb.dev/media/nZZZy9m.gif'),
  ('Puxada com triângulo', 'back', '{biceps,forearms}', 'Polia alta e triângulo', 'beginner', 'Puxada na polia alta com pegada fechada e neutra.', 'Sente com as coxas presas e segure o triângulo com os braços estendidos.
Puxe até a parte de cima do peito, levando os cotovelos para baixo.
Volte devagar até estender os braços.', '4c9BhzB', 'https://static.exercisedb.dev/media/4c9BhzB.gif'),
  ('Barra fixa supinada', 'back', '{biceps,forearms}', 'Barra fixa', 'advanced', 'Barra fixa com as palmas voltadas para você, que aumenta o trabalho do bíceps.', 'Segure a barra com as palmas voltadas para o rosto, na largura dos ombros.
Suba até o queixo passar a barra.
Desça com controle até estender os braços.', 'T2mxWqc', 'https://static.exercisedb.dev/media/T2mxWqc.gif'),
  ('Barra fixa assistida', 'back', '{biceps,forearms}', 'Máquina graviton', 'beginner', 'Barra fixa na máquina com apoio, que reduz o peso a ser levantado.', 'Ajuste a carga de apoio, ajoelhe ou pise na plataforma e segure as alças.
Suba até o queixo passar a linha das mãos.
Desça devagar até estender os braços.', 'kiJ4Z2K', 'https://static.exercisedb.dev/media/kiJ4Z2K.gif'),
  ('Remada invertida', 'back', '{biceps,core}', 'Barra baixa ou Smith', 'intermediate', 'Remada com o peso do corpo, deitado sob uma barra baixa.', 'Deite sob a barra, segure-a pouco além da largura dos ombros e mantenha o corpo reto.
Puxe o peito em direção à barra, aproximando as escápulas.
Desça devagar até estender os braços.', 'bZGHsAZ', 'https://static.exercisedb.dev/media/bZGHsAZ.gif'),
  ('Hiperextensão lombar', 'back', '{glutes,hamstrings}', 'Banco romano', 'beginner', 'Extensão do tronco no banco romano, para a região lombar.', 'Apoie as coxas no banco e prenda os calcanhares, tronco alinhado com as pernas.
Desça o tronco à frente com a coluna neutra.
Suba até alinhar o tronco com as pernas, sem ultrapassar essa linha.', 'zhMwOwE', 'https://static.exercisedb.dev/media/zhMwOwE.gif'),
  ('Encolhimento com halteres', 'back', '{forearms}', 'Halteres', 'beginner', 'Elevação dos ombros com halteres, para o trapézio.', 'Em pé, um halter em cada mão ao lado do corpo.
Eleve os ombros em direção às orelhas, sem dobrar os cotovelos.
Segure um instante e desça devagar.', 'NJzBsGJ', 'https://static.exercisedb.dev/media/NJzBsGJ.gif'),
  ('Encolhimento com barra', 'back', '{forearms}', 'Barra', 'beginner', 'Elevação dos ombros com barra, para o trapézio.', 'Em pé, segure a barra à frente das coxas com os braços estendidos.
Eleve os ombros em direção às orelhas.
Segure um instante e desça devagar, sem girar os ombros.', 'dG7tG5y', 'https://static.exercisedb.dev/media/dG7tG5y.gif'),
  ('Desenvolvimento Arnold', 'shoulders', '{triceps}', 'Halteres e banco', 'intermediate', 'Desenvolvimento com rotação dos punhos durante a subida.', 'Sente com os halteres à frente dos ombros, palmas voltadas para você.
Empurre para cima girando as palmas para frente.
Desça fazendo o caminho inverso.', 'eOrFCnx', 'https://static.exercisedb.dev/media/eOrFCnx.gif'),
  ('Desenvolvimento na máquina', 'shoulders', '{triceps}', 'Máquina de desenvolvimento', 'beginner', 'Desenvolvimento sentado em máquina, com trajetória guiada.', 'Ajuste o banco para as alças ficarem na altura dos ombros e apoie as costas.
Empurre para cima até quase estender os cotovelos.
Desça devagar até a posição inicial.', 'dNFYIU1', 'https://static.exercisedb.dev/media/dNFYIU1.gif'),
  ('Elevação lateral na polia', 'shoulders', '{}', 'Polia baixa', 'intermediate', 'Elevação lateral com cabo, que mantém a tensão durante todo o movimento.', 'Fique de lado para a polia baixa e segure a alça com a mão mais distante.
Eleve o braço pela lateral até a altura do ombro.
Desça devagar e complete as repetições antes de trocar de lado.', 'goJ6ezq', 'https://static.exercisedb.dev/media/goJ6ezq.gif'),
  ('Elevação lateral na máquina', 'shoulders', '{}', 'Máquina de elevação lateral', 'beginner', 'Elevação lateral sentado em máquina.', 'Sente com os braços apoiados nos encostos laterais.
Eleve os braços até a altura dos ombros.
Desça devagar, sem deixar as placas baterem.', 'dRTfGZT', 'https://static.exercisedb.dev/media/dRTfGZT.gif'),
  ('Remada alta com barra', 'shoulders', '{back,biceps}', 'Barra', 'intermediate', 'Puxar a barra rente ao corpo até a altura do peito, para deltoides e trapézio.', 'Em pé, segure a barra à frente das coxas com pegada na largura dos ombros.
Puxe a barra rente ao corpo até a altura do peito, cotovelos apontando para os lados.
Desça devagar até estender os braços.', 'UDlhcO8', 'https://static.exercisedb.dev/media/UDlhcO8.gif'),
  ('Crucifixo inverso na máquina', 'shoulders', '{back}', 'Máquina peck deck', 'beginner', 'Abertura dos braços para trás na máquina, para a parte posterior do deltoide.', 'Sente de frente para o encosto e segure as alças com os braços estendidos à frente.
Abra os braços para trás até a linha dos ombros.
Volte devagar à posição inicial.', 'myfUsKf', 'https://static.exercisedb.dev/media/myfUsKf.gif'),
  ('Rosca direta com halteres', 'biceps', '{forearms}', 'Halteres', 'beginner', 'Flexão dos cotovelos com os dois halteres ao mesmo tempo.', 'Em pé, um halter em cada mão com as palmas para frente.
Flexione os cotovelos até os halteres chegarem perto dos ombros.
Desça devagar até estender os braços.', 'NbVPDMW', 'https://static.exercisedb.dev/media/NbVPDMW.gif'),
  ('Rosca na polia', 'biceps', '{forearms}', 'Polia baixa e barra', 'beginner', 'Rosca direta na polia baixa, com tensão constante.', 'Em pé de frente para a polia baixa, segure a barra com as palmas para cima.
Flexione os cotovelos mantendo-os junto ao corpo.
Desça devagar até estender os braços.', 'G08RZcQ', 'https://static.exercisedb.dev/media/G08RZcQ.gif'),
  ('Rosca inclinada com halteres', 'biceps', '{forearms}', 'Halteres e banco inclinado', 'intermediate', 'Rosca deitado no banco inclinado, que alonga o bíceps no início do movimento.', 'Deite no banco inclinado com os braços soltos para baixo.
Flexione os cotovelos sem tirar os ombros do banco.
Desça devagar até estender os braços.', 'ae9UoXQ', 'https://static.exercisedb.dev/media/ae9UoXQ.gif'),
  ('Rosca com barra W', 'biceps', '{forearms}', 'Barra W', 'beginner', 'Rosca direta com a barra W, mais confortável para os punhos.', 'Em pé, segure a barra W nas partes inclinadas, palmas para cima.
Flexione os cotovelos até a barra chegar perto dos ombros.
Desça devagar, sem balançar o tronco.', '6TG6x2w', 'https://static.exercisedb.dev/media/6TG6x2w.gif'),
  ('Rosca Scott na máquina', 'biceps', '{forearms}', 'Máquina de rosca Scott', 'beginner', 'Rosca com os braços apoiados, em máquina.', 'Sente e apoie a parte de trás dos braços no encosto.
Flexione os cotovelos trazendo as alças em direção aos ombros.
Desça devagar até quase estender os braços.', 'b6hQYMb', 'https://static.exercisedb.dev/media/b6hQYMb.gif'),
  ('Rosca spider', 'biceps', '{forearms}', 'Barra W e banco Scott', 'intermediate', 'Rosca com os braços na vertical, apoiados no lado reto do banco Scott.', 'Apoie o peito e os braços no banco, com os braços na vertical.
Flexione os cotovelos até a barra chegar perto dos ombros.
Desça devagar até estender os braços.', '2kattbR', 'https://static.exercisedb.dev/media/2kattbR.gif'),
  ('Tríceps corda', 'triceps', '{}', 'Polia alta e corda', 'beginner', 'Extensão dos cotovelos na polia alta usando a corda.', 'Em pé em frente à polia, segure a corda com os cotovelos junto ao corpo.
Estenda os braços afastando as mãos no final.
Volte devagar até os antebraços passarem de 90 graus.', 'dU605di', 'https://static.exercisedb.dev/media/dU605di.gif'),
  ('Tríceps coice com halter', 'triceps', '{}', 'Halter e banco', 'beginner', 'Extensão do cotovelo para trás, com o tronco inclinado.', 'Apoie a mão e o joelho no banco, braço de trabalho paralelo ao tronco.
Estenda o cotovelo levando o halter para trás.
Volte devagar, sem mover o braço.', 'W6PxUkg', 'https://static.exercisedb.dev/media/W6PxUkg.gif'),
  ('Tríceps na polia acima da cabeça', 'triceps', '{}', 'Polia e corda', 'intermediate', 'Extensão dos cotovelos acima da cabeça, de costas para a polia.', 'De costas para a polia, segure a corda atrás da cabeça com os cotovelos apontando para frente.
Estenda os braços à frente e acima da cabeça.
Volte devagar até os cotovelos flexionarem por completo.', '2IxROQ1', 'https://static.exercisedb.dev/media/2IxROQ1.gif'),
  ('Tríceps na máquina', 'triceps', '{}', 'Máquina de tríceps', 'beginner', 'Extensão dos cotovelos sentado, com os braços apoiados.', 'Sente e apoie os braços no encosto, segurando as alças.
Estenda os cotovelos até o fim.
Volte devagar, sem tirar os braços do apoio.', 'Ser9eQp', 'https://static.exercisedb.dev/media/Ser9eQp.gif'),
  ('Supino fechado', 'triceps', '{chest,shoulders}', 'Barra e banco', 'intermediate', 'Supino com as mãos na largura dos ombros, com ênfase no tríceps.', 'Deite no banco e segure a barra com as mãos na largura dos ombros.
Desça a barra até a parte de baixo do peito, cotovelos junto ao corpo.
Empurre até estender os braços.', 'J6Dx1Mu', 'https://static.exercisedb.dev/media/J6Dx1Mu.gif'),
  ('Flexão diamante', 'triceps', '{chest,shoulders}', 'Peso corporal', 'intermediate', 'Flexão com as mãos juntas, com ênfase no tríceps.', 'Apoie as mãos juntas sob o peito, polegares e indicadores se tocando.
Desça com os cotovelos junto ao corpo.
Empurre até estender os braços, mantendo o corpo alinhado.', 'soIB2rj', 'https://static.exercisedb.dev/media/soIB2rj.gif'),
  ('Rosca de punho inversa', 'forearms', '{}', 'Barra', 'beginner', 'Extensão dos punhos com as palmas para baixo, para os extensores do antebraço.', 'Apoie os antebraços no banco, palmas para baixo e punhos para fora.
Eleve as costas das mãos estendendo os punhos.
Desça devagar.', 'LsZkfU6', 'https://static.exercisedb.dev/media/LsZkfU6.gif'),
  ('Rosca de punho com halteres', 'forearms', '{}', 'Halteres e banco', 'beginner', 'Flexão dos punhos com halteres, antebraços apoiados.', 'Sente e apoie os antebraços nas coxas ou no banco, palmas para cima.
Flexione os punhos levando os halteres para cima.
Desça devagar, deixando os punhos estenderem.', '2dImyQ8', 'https://static.exercisedb.dev/media/2dImyQ8.gif'),
  ('Abdominal infra', 'core', '{}', 'Peso corporal', 'beginner', 'Elevação do quadril deitado, com ênfase na parte inferior do abdômen.', 'Deite com os joelhos flexionados e as mãos ao lado do corpo.
Leve os joelhos em direção ao peito, tirando o quadril do chão.
Desça devagar, sem apoiar os pés.', 'nCU1Ekp', 'https://static.exercisedb.dev/media/nCU1Ekp.gif'),
  ('Abdominal completo', 'core', '{}', 'Peso corporal', 'beginner', 'Abdominal em que o tronco sobe até ficar sentado.', 'Deite com os joelhos flexionados e os pés no chão.
Suba o tronco até ficar sentado, contraindo o abdômen.
Desça devagar, vértebra por vértebra.', 'Bn6TXyO', 'https://static.exercisedb.dev/media/Bn6TXyO.gif'),
  ('Abdominal oblíquo', 'core', '{}', 'Peso corporal', 'beginner', 'Abdominal com rotação, para os músculos laterais do abdômen.', 'Deite com os joelhos flexionados e uma mão ao lado da cabeça.
Suba o tronco girando o ombro em direção ao joelho oposto.
Desça devagar e complete as repetições antes de trocar de lado.', 'cJgSTmh', 'https://static.exercisedb.dev/media/cJgSTmh.gif'),
  ('Giro russo', 'core', '{}', 'Peso corporal', 'intermediate', 'Rotação do tronco sentado, para os oblíquos.', 'Sente com os joelhos flexionados e incline o tronco para trás, coluna reta.
Gire o tronco para um lado, levando as mãos ao lado do quadril.
Gire para o outro lado, de forma contínua e controlada.', 'XVDdcoj', 'https://static.exercisedb.dev/media/XVDdcoj.gif'),
  ('Elevação de pernas na barra', 'core', '{forearms}', 'Barra fixa', 'advanced', 'Elevação das pernas pendurado na barra.', 'Pendure-se na barra com os braços estendidos.
Eleve as pernas à frente até a altura do quadril, sem balançar.
Desça devagar até a posição inicial.', 'I3tsCnC', 'https://static.exercisedb.dev/media/I3tsCnC.gif'),
  ('Dead bug', 'core', '{}', 'Peso corporal', 'beginner', 'Exercício de estabilidade deitado, movendo braço e perna opostos.', 'Deite de costas com os braços para cima e os joelhos flexionados a 90 graus.
Estenda um braço para trás e a perna oposta à frente, com a lombar no chão.
Volte e repita com o outro lado.', 'iny3m5y', 'https://static.exercisedb.dev/media/iny3m5y.gif'),
  ('Roda abdominal', 'core', '{shoulders,back}', 'Roda abdominal', 'advanced', 'Rolamento à frente com a roda, a partir dos joelhos.', 'Ajoelhe e segure a roda sob os ombros.
Role à frente até onde conseguir manter a lombar neutra.
Volte contraindo o abdômen.', 'NAgVB3t', 'https://static.exercisedb.dev/media/NAgVB3t.gif'),
  ('Abdominal na máquina', 'core', '{}', 'Máquina abdominal', 'beginner', 'Flexão do tronco sentado, com carga.', 'Sente, ajuste a carga e segure as alças.
Flexione o tronco à frente contraindo o abdômen.
Volte devagar à posição inicial.', 'eXFXCY0', 'https://static.exercisedb.dev/media/eXFXCY0.gif'),
  ('Agachamento frontal', 'quadriceps', '{glutes,core}', 'Barra', 'advanced', 'Agachamento com a barra apoiada à frente dos ombros.', 'Apoie a barra na frente dos ombros, cotovelos altos.
Agache mantendo o tronco ereto e os joelhos na direção dos pés.
Suba empurrando o chão, sem deixar os cotovelos caírem.', 'qi996YS', 'https://static.exercisedb.dev/media/qi996YS.gif'),
  ('Agachamento no Smith', 'quadriceps', '{glutes,hamstrings}', 'Máquina Smith', 'beginner', 'Agachamento na barra guiada.', 'Apoie a barra na parte de cima das costas e posicione os pés um pouco à frente.
Destrave e desça até cerca de 90 graus nos joelhos.
Suba até quase estender os joelhos.', 'jFtipLl', 'https://static.exercisedb.dev/media/jFtipLl.gif'),
  ('Agachamento sumô no Smith', 'quadriceps', '{glutes}', 'Máquina Smith', 'intermediate', 'Agachamento com os pés afastados e apontados para fora, na barra guiada.', 'Apoie a barra nas costas, pés bem afastados e apontados para fora.
Desça mantendo os joelhos na direção dos pés.
Suba contraindo glúteos e parte interna das coxas.', 'dzz6BiV', 'https://static.exercisedb.dev/media/dzz6BiV.gif'),
  ('Afundo caminhando', 'quadriceps', '{glutes,hamstrings}', 'Peso corporal ou halteres', 'intermediate', 'Passadas alternadas avançando pelo espaço.', 'Em pé, dê um passo largo à frente e desça até os dois joelhos ficarem perto de 90 graus.
Suba trazendo a perna de trás à frente, já no próximo passo.
Alterne as pernas mantendo o tronco ereto.', 'IZVHb27', 'https://static.exercisedb.dev/media/IZVHb27.gif'),
  ('Subida no banco', 'quadriceps', '{glutes}', 'Halteres e banco ou caixa', 'beginner', 'Subir em um banco ou caixa, uma perna de cada vez.', 'Em pé de frente para o banco, apoie um pé inteiro sobre ele.
Suba estendendo a perna de cima, sem tomar impulso com a de baixo.
Desça devagar e repita; depois troque de perna.', 'aXtJhlg', 'https://static.exercisedb.dev/media/aXtJhlg.gif'),
  ('Agachamento com salto', 'quadriceps', '{glutes,calves}', 'Peso corporal', 'intermediate', 'Agachamento seguido de salto, para potência.', 'Em pé, pés na largura dos ombros, agache até as coxas ficarem paralelas ao chão.
Salte estendendo quadril, joelhos e tornozelos.
Aterrisse suave, já descendo para a próxima repetição.', 'LIlE5Tn', 'https://static.exercisedb.dev/media/LIlE5Tn.gif'),
  ('Bom dia com barra', 'hamstrings', '{glutes,back}', 'Barra', 'intermediate', 'Flexão do quadril com a barra nas costas, para posteriores de coxa e lombar.', 'Apoie a barra na parte de cima das costas, joelhos levemente flexionados.
Incline o tronco à frente levando o quadril para trás, coluna neutra.
Volte à posição ereta contraindo os glúteos.', 'XlZ4lAC', 'https://static.exercisedb.dev/media/XlZ4lAC.gif'),
  ('Levantamento terra romeno com halteres', 'hamstrings', '{glutes,back}', 'Halteres', 'intermediate', 'Levantamento romeno com um halter em cada mão.', 'Em pé, halteres à frente das coxas e joelhos levemente flexionados.
Leve o quadril para trás descendo os halteres rente às pernas.
Suba contraindo os glúteos até ficar ereto.', 'rR0LJzx', 'https://static.exercisedb.dev/media/rR0LJzx.gif'),
  ('Stiff com barra', 'hamstrings', '{glutes,back}', 'Barra', 'intermediate', 'Flexão do quadril com as pernas quase estendidas, com barra.', 'Em pé, segure a barra à frente das coxas, joelhos apenas destravados.
Incline o tronco à frente com a coluna neutra, barra rente às pernas.
Volte à posição inicial contraindo glúteos e posteriores.', 'hrVQWvE', 'https://static.exercisedb.dev/media/hrVQWvE.gif'),
  ('Elevação pélvica no chão com barra', 'glutes', '{hamstrings}', 'Barra', 'beginner', 'Elevação do quadril deitado no chão, com a barra sobre o quadril.', 'Deite com os joelhos flexionados, pés no chão e a barra sobre o quadril.
Eleve o quadril até alinhar com o tronco e os joelhos.
Contraia os glúteos no topo e desça devagar.', 'qKBpF7I', 'https://static.exercisedb.dev/media/qKBpF7I.gif'),
  ('Extensão de quadril na máquina', 'glutes', '{hamstrings}', 'Máquina de glúteos', 'beginner', 'Empurrar a plataforma para trás com uma perna, na máquina.', 'Apoie o tronco no encosto e um pé na plataforma.
Empurre a plataforma para trás estendendo o quadril.
Volte devagar e complete as repetições antes de trocar de perna.', 'OPqShYN', 'https://static.exercisedb.dev/media/OPqShYN.gif'),
  ('Levantamento terra sumô', 'glutes', '{hamstrings,quadriceps,back}', 'Barra', 'advanced', 'Levantamento terra com os pés afastados e as mãos por dentro das pernas.', 'Pés bem afastados e apontados para fora, segure a barra por dentro das pernas.
Com a coluna neutra, empurre o chão e suba a barra rente às pernas.
Desça levando o quadril para trás, com controle.', 'KgI0tqW', 'https://static.exercisedb.dev/media/KgI0tqW.gif'),
  ('Panturrilha em pé com halteres', 'calves', '{}', 'Halteres e degrau', 'beginner', 'Elevação dos calcanhares em pé, segurando halteres.', 'Apoie a parte da frente dos pés no degrau, um halter em cada mão.
Suba na ponta dos pés o mais alto possível.
Desça devagar até alongar as panturrilhas.', 'dPmaUaU', 'https://static.exercisedb.dev/media/dPmaUaU.gif'),
  ('Panturrilha em pé com barra', 'calves', '{}', 'Barra', 'intermediate', 'Elevação dos calcanhares em pé, com a barra nas costas.', 'Apoie a barra na parte de cima das costas, pés na largura do quadril.
Suba na ponta dos pés e segure um instante.
Desça devagar.', '8ozhUIZ', 'https://static.exercisedb.dev/media/8ozhUIZ.gif'),
  ('Panturrilha burrinho', 'calves', '{}', 'Banco e degrau', 'intermediate', 'Elevação dos calcanhares com o tronco inclinado à frente.', 'Apoie as mãos no banco, tronco inclinado, parte da frente dos pés no degrau.
Suba na ponta dos pés o mais alto possível.
Desça devagar até alongar as panturrilhas.', 'u5ESqzH', 'https://static.exercisedb.dev/media/u5ESqzH.gif'),
  ('Clean and press', 'full_body', '{shoulders,quadriceps,glutes,back}', 'Barra', 'advanced', 'Levar a barra do chão aos ombros e empurrá-la acima da cabeça.', 'Segure a barra no chão com a coluna neutra, pés na largura do quadril.
Suba a barra rente ao corpo e encaixe-a na frente dos ombros.
Empurre acima da cabeça até estender os braços e volte com controle.', 'SGY8Zui', 'https://static.exercisedb.dev/media/SGY8Zui.gif'),
  ('Thruster com kettlebell', 'full_body', '{quadriceps,shoulders,glutes}', 'Kettlebells', 'intermediate', 'Agachamento seguido de desenvolvimento, com kettlebells.', 'Em pé, kettlebells apoiados na frente dos ombros.
Agache com o tronco ereto.
Suba com força e empurre os kettlebells acima da cabeça.', 'yWxMvB5', 'https://static.exercisedb.dev/media/yWxMvB5.gif'),
  ('Levantamento turco', 'full_body', '{shoulders,core,glutes}', 'Kettlebell', 'advanced', 'Levantar do chão até ficar em pé mantendo o kettlebell acima da cabeça.', 'Deite de costas com o kettlebell em uma mão, braço estendido para cima.
Levante-se por etapas, apoiando no cotovelo, na mão e passando para o joelho, sem tirar os olhos do peso.
Fique em pé e faça o caminho inverso para voltar ao chão.', 'Ha7SZ3y', 'https://static.exercisedb.dev/media/Ha7SZ3y.gif'),
  ('Burpee com halteres', 'full_body', '{chest,shoulders,quadriceps}', 'Halteres', 'intermediate', 'Burpee com as mãos apoiadas nos halteres.', 'Em pé com um halter em cada mão, agache e apoie os halteres no chão.
Leve os pés para trás até a posição de prancha e volte.
Fique em pé levantando os halteres ao lado do corpo.', '0JtKWum', 'https://static.exercisedb.dev/media/0JtKWum.gif'),
  ('Corrida', 'cardio', '{}', 'Peso corporal', 'beginner', 'Corrida no ritmo indicado pelo treinador.', 'Comece caminhando ou trotando para aquecer.
Mantenha o tronco ereto, os ombros relaxados e passadas curtas.
Reduza o ritmo aos poucos antes de parar.', 'oLrKqDH', 'https://static.exercisedb.dev/media/oLrKqDH.gif'),
  ('Pular corda', 'cardio', '{calves}', 'Corda', 'beginner', 'Saltos contínuos sobre a corda.', 'Segure a corda com os cotovelos junto ao corpo.
Gire a corda com os punhos e salte baixo, na ponta dos pés.
Mantenha o ritmo e aterrisse suave.', 'e1e76I2', 'https://static.exercisedb.dev/media/e1e76I2.gif'),
  ('Elíptico', 'cardio', '{}', 'Elíptico', 'beginner', 'Movimento contínuo de pernas e braços no aparelho elíptico.', 'Suba no aparelho e segure as alças.
Movimente pernas e braços de forma contínua, com o tronco ereto.
Ajuste a carga para o ritmo indicado pelo treinador.', 'rjtuP6X', 'https://static.exercisedb.dev/media/rjtuP6X.gif'),
  ('Escalador', 'cardio', '{core,shoulders}', 'Peso corporal', 'intermediate', 'Levar os joelhos ao peito de forma alternada, em posição de prancha.', 'Fique em posição de prancha com os braços estendidos.
Leve um joelho em direção ao peito e volte.
Alterne as pernas rapidamente, sem deixar o quadril subir.', 'RJgzwny', 'https://static.exercisedb.dev/media/RJgzwny.gif'),
  ('Caminhada inclinada na esteira', 'cardio', '{glutes,calves}', 'Esteira', 'beginner', 'Caminhada na esteira com inclinação.', 'Ajuste a inclinação e a velocidade indicadas pelo treinador.
Caminhe com o tronco ereto, sem segurar nas barras laterais.
Reduza a inclinação e a velocidade aos poucos antes de parar.', 'rjiM4L3', 'https://static.exercisedb.dev/media/rjiM4L3.gif'),
  ('Caminhada do urso', 'cardio', '{shoulders,core}', 'Peso corporal', 'intermediate', 'Deslocamento em quatro apoios, com os joelhos fora do chão.', 'Fique em quatro apoios e tire os joelhos do chão.
Avance movendo mão e pé opostos ao mesmo tempo.
Mantenha o quadril baixo e o abdômen firme.', '0Yz8WdV', 'https://static.exercisedb.dev/media/0Yz8WdV.gif'),
  ('Simulador de escada', 'cardio', '{glutes,quadriceps}', 'Simulador de escada', 'beginner', 'Subida contínua de degraus no aparelho.', 'Suba no aparelho e segure de leve nas barras.
Suba os degraus apoiando o pé inteiro, com o tronco ereto.
Mantenha o ritmo indicado pelo treinador.', 'j9Q5crt', 'https://static.exercisedb.dev/media/j9Q5crt.gif');
--> statement-breakpoint
INSERT INTO exercises (name, muscle_group, secondary_muscles, equipment, difficulty, description, instructions, demo_external_id, demo_url, demo_status, demo_synced_at)
SELECT n.name, n.muscle_group::muscle_group, n.secondary::muscle_group[], n.equipment, n.difficulty::exercise_difficulty, n.description, n.instructions, n.external_id, n.url, 'matched', now()
FROM _new n
WHERE NOT EXISTS (SELECT 1 FROM exercises e WHERE e.workspace_id IS NULL AND e.archived_at IS NULL AND lower(e.name) = lower(n.name));
--> statement-breakpoint
DROP TABLE _new;
--> statement-breakpoint

-- 3. Platform exercises without a reliable match stay marked for review.
UPDATE exercises SET demo_status = 'unmatched' WHERE workspace_id IS NULL AND demo_url IS NULL;
--> statement-breakpoint

-- 4. Other names for the same movement.
CREATE TEMP TABLE _alias (name text, aliases text);
--> statement-breakpoint
INSERT INTO _alias VALUES
  ('Supino reto com barra', '{"supino reto","supino","supino com barra"}'),
  ('Supino reto com halteres', '{"supino com halteres"}'),
  ('Supino inclinado com halteres', '{"supino inclinado"}'),
  ('Supino declinado com barra', '{"supino declinado"}'),
  ('Crucifixo com halteres', '{"crucifixo","crucifixo reto","crucifixo reto com halteres"}'),
  ('Crossover na polia', '{"crossover","cross over","crucifixo na polia"}'),
  ('Peck deck', '{"voador","crucifixo na maquina","peck deck fly"}'),
  ('Flexão de braço', '{"flexao","flexao de bracos","apoio"}'),
  ('Puxada frontal', '{"puxada alta","pulley frente","puxada aberta","puxador frontal"}'),
  ('Remada baixa na polia', '{"remada baixa","remada sentada","remada baixa com triangulo"}'),
  ('Remada curvada com barra', '{"remada curvada"}'),
  ('Remada unilateral com halter', '{"remada unilateral","remada serrote","serrote"}'),
  ('Remada cavalinho', '{"remada na barra t","cavalinho"}'),
  ('Pulldown com braços estendidos', '{"pulldown","pull down","pulldown na polia"}'),
  ('Barra fixa', '{"barra fixa pronada","pull up"}'),
  ('Desenvolvimento com halteres', '{"desenvolvimento","desenvolvimento de ombros"}'),
  ('Desenvolvimento militar com barra', '{"desenvolvimento militar","desenvolvimento com barra"}'),
  ('Elevação lateral', '{"elevacao lateral com halteres"}'),
  ('Elevação frontal', '{"elevacao frontal com halteres"}'),
  ('Crucifixo inverso', '{"crucifixo inverso com halteres","voador inverso com halteres"}'),
  ('Rosca direta com barra', '{"rosca direta","rosca com barra","rosca biceps"}'),
  ('Rosca alternada com halteres', '{"rosca alternada"}'),
  ('Rosca martelo', '{"rosca martelo com halteres"}'),
  ('Rosca Scott', '{"rosca scott com barra"}'),
  ('Tríceps na polia', '{"triceps pulley","triceps polia","triceps barra"}'),
  ('Tríceps francês com halter', '{"triceps frances"}'),
  ('Tríceps testa', '{"triceps testa com barra"}'),
  ('Mergulho no banco', '{"triceps banco","triceps no banco"}'),
  ('Mergulho nas paralelas', '{"paralelas","mergulho"}'),
  ('Abdominal supra', '{"abdominal","abdominal reto"}'),
  ('Abdominal na polia', '{"abdominal crunch na polia"}'),
  ('Agachamento livre', '{"agachamento","agachamento com barra"}'),
  ('Agachamento búlgaro', '{"bulgaro","afundo bulgaro"}'),
  ('Agachamento hack', '{"hack","hack machine"}'),
  ('Leg press 45', '{"leg press","leg 45","leg press 45 graus"}'),
  ('Cadeira extensora', '{"extensora"}'),
  ('Afundo', '{"afundo com halteres","passada"}'),
  ('Levantamento terra romeno', '{"terra romeno","rdl"}'),
  ('Stiff com halteres', '{"stiff"}'),
  ('Mesa flexora', '{"flexora deitado"}'),
  ('Cadeira flexora', '{"flexora","flexora sentado"}'),
  ('Elevação pélvica', '{"hip thrust","elevacao pelvica com barra"}'),
  ('Ponte de glúteos', '{"ponte","glute bridge"}'),
  ('Coice na polia', '{"gluteo na polia","coice","extensao de quadril na polia"}'),
  ('Abdução de quadril na máquina', '{"cadeira abdutora","abdutora","abducao"}'),
  ('Panturrilha em pé', '{"panturrilha","gemeos em pe","panturrilha em pe na maquina"}'),
  ('Panturrilha sentado', '{"gemeos sentado","panturrilha sentada"}'),
  ('Levantamento terra', '{"terra","deadlift"}'),
  ('Kettlebell swing', '{"swing"}'),
  ('Esteira', '{"corrida na esteira"}'),
  ('Bicicleta ergométrica', '{"bike","bicicleta"}'),
  ('Tríceps corda', '{"triceps na corda","triceps corda na polia"}'),
  ('Rosca direta com halteres', '{"rosca com halteres"}'),
  ('Supino fechado', '{"supino pegada fechada"}'),
  ('Remada alta com barra', '{"remada alta"}'),
  ('Encolhimento com halteres', '{"encolhimento","encolhimento de ombros"}'),
  ('Abdominal infra', '{"abdominal reverso"}'),
  ('Abdominal completo', '{"sit up","abdominal sit up"}'),
  ('Giro russo', '{"russian twist","abdominal russo"}'),
  ('Escalador', '{"mountain climber"}'),
  ('Hiperextensão lombar', '{"extensao lombar","lombar no banco romano"}'),
  ('Agachamento no Smith', '{"agachamento smith"}'),
  ('Afundo caminhando', '{"passada caminhando","avanco"}'),
  ('Subida no banco', '{"step up"}'),
  ('Bom dia com barra', '{"bom dia","good morning"}'),
  ('Agachamento frontal', '{"front squat"}'),
  ('Pular corda', '{"corda"}'),
  ('Levantamento terra sumô', '{"terra sumo"}'),
  ('Barra fixa supinada', '{"chin up","barra supinada"}'),
  ('Barra fixa assistida', '{"graviton","barra no graviton"}'),
  ('Rosca Scott na máquina', '{"scott maquina"}'),
  ('Elevação lateral na polia', '{"elevacao lateral polia"}'),
  ('Supino na máquina', '{"chest press","supino maquina","supino reto na maquina"}'),
  ('Remada na máquina', '{"remada maquina","remada sentada na maquina"}'),
  ('Desenvolvimento na máquina', '{"desenvolvimento maquina","shoulder press"}'),
  ('Crucifixo inverso na máquina', '{"voador inverso","peck deck inverso"}');
--> statement-breakpoint
UPDATE exercises e SET aliases = a.aliases::text[]
FROM _alias a WHERE e.workspace_id IS NULL AND e.archived_at IS NULL AND lower(e.name) = lower(a.name);
--> statement-breakpoint
DROP TABLE _alias;
--> statement-breakpoint

-- 5. Every exercise trainers already have receives its demonstration now.
SELECT set_config('app.is_system', 'on', true);
--> statement-breakpoint
SELECT * FROM app_propagate_exercise_demos();
--> statement-breakpoint
SELECT set_config('app.is_system', 'off', true);
