-- Phase 2B-1: media assets and exercise library.

-- An exercise video must belong to the same workspace as the exercise.
ALTER TABLE media_assets ADD CONSTRAINT media_assets_id_ws_uq UNIQUE (id, workspace_id);
--> statement-breakpoint
ALTER TABLE exercises ADD CONSTRAINT exercises_video_ws_fk
  FOREIGN KEY (video_asset_id, workspace_id) REFERENCES media_assets (id, workspace_id) ON DELETE SET NULL (video_asset_id);
--> statement-breakpoint
ALTER TABLE media_assets ADD CONSTRAINT media_assets_size_ck CHECK (size_bytes > 0 AND size_bytes <= 524288000);
--> statement-breakpoint
ALTER TABLE exercises ADD CONSTRAINT exercises_len_ck CHECK (
  length(name) BETWEEN 2 AND 80 AND length(equipment) <= 80 AND length(description) <= 1000 AND length(instructions) <= 3000
);
--> statement-breakpoint

-- media_assets: members of the workspace can read; trainers write. No deletes
-- by the app (status 'deleted' + storage removal keeps an audit trail).
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY media_select ON media_assets FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY media_insert ON media_assets FOR INSERT TO cadencia_app
  WITH CHECK (
    workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer'
    AND uploaded_by_user_id = (SELECT app_user_id())
  );
--> statement-breakpoint
CREATE POLICY media_update ON media_assets FOR UPDATE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON media_assets FROM cadencia_app;
--> statement-breakpoint

-- exercises: the platform library (workspace_id NULL) is readable by everyone
-- signed in to a workspace and writable only by platform admins.
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY exercises_select ON exercises FOR SELECT TO cadencia_app
  USING (
    workspace_id IS NULL
    OR (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL)
  );
--> statement-breakpoint
CREATE POLICY exercises_trainer_write ON exercises FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
CREATE POLICY exercises_platform_admin ON exercises FOR ALL TO cadencia_app
  USING (workspace_id IS NULL AND (SELECT app_is_platform_admin()))
  WITH CHECK (workspace_id IS NULL AND (SELECT app_is_platform_admin()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON exercises FROM cadencia_app;
--> statement-breakpoint

-- Platform library seed (pt-BR). Trainers can copy any of these into their own library to customize.
INSERT INTO exercises (name, muscle_group, equipment, instructions) VALUES
  ('Supino reto com barra', 'chest', 'Barra e banco', 'Deite no banco com os pés firmes no chão. Desça a barra até a linha do peito controlando o movimento e empurre até estender os cotovelos, sem tirar as escápulas do banco.'),
  ('Supino inclinado com halteres', 'chest', 'Halteres e banco inclinado', 'Banco entre 30 e 45 graus. Desça os halteres ao lado do peito e empurre para cima, aproximando-os no topo sem bater.'),
  ('Crucifixo com halteres', 'chest', 'Halteres e banco', 'Cotovelos levemente flexionados. Abra os braços em arco até sentir o alongamento do peito e volte pelo mesmo caminho.'),
  ('Flexão de braço', 'chest', 'Peso corporal', 'Mãos um pouco além da largura dos ombros, corpo alinhado. Desça até o peito quase tocar o chão e empurre de volta.'),
  ('Puxada frontal', 'back', 'Polia alta', 'Pegada aberta. Puxe a barra até a parte de cima do peito levando os cotovelos para baixo e para trás. Volte controlando.'),
  ('Remada curvada com barra', 'back', 'Barra', 'Tronco inclinado à frente, coluna neutra. Puxe a barra em direção ao umbigo e desça devagar.'),
  ('Remada unilateral com halter', 'back', 'Halter e banco', 'Apoie mão e joelho no banco. Puxe o halter junto ao corpo até a cintura, sem girar o tronco.'),
  ('Barra fixa', 'back', 'Barra fixa', 'Pegada pronada. Suba até o queixo passar a barra e desça até estender os braços, sem balançar.'),
  ('Desenvolvimento com halteres', 'shoulders', 'Halteres e banco', 'Sentado, halteres na altura das orelhas. Empurre para cima até quase estender os cotovelos e volte.'),
  ('Elevação lateral', 'shoulders', 'Halteres', 'Cotovelos levemente flexionados. Eleve os braços pelas laterais até a altura dos ombros e desça devagar.'),
  ('Face pull', 'shoulders', 'Polia e corda', 'Polia na altura do rosto. Puxe a corda em direção à testa abrindo as mãos e afastando os cotovelos.'),
  ('Rosca direta com barra', 'biceps', 'Barra', 'Cotovelos junto ao corpo. Flexione até a barra chegar perto dos ombros e desça sem balançar o tronco.'),
  ('Rosca martelo', 'biceps', 'Halteres', 'Pegada neutra (palmas viradas uma para a outra). Flexione os cotovelos mantendo-os parados ao lado do corpo.'),
  ('Tríceps na polia', 'triceps', 'Polia alta', 'Cotovelos fixos ao lado do corpo. Estenda os braços até o fim e volte devagar até 90 graus.'),
  ('Tríceps francês com halter', 'triceps', 'Halter', 'Halter acima da cabeça com as duas mãos. Desça atrás da cabeça flexionando os cotovelos e estenda de volta.'),
  ('Mergulho no banco', 'triceps', 'Banco', 'Mãos no banco atrás do corpo. Desça flexionando os cotovelos até cerca de 90 graus e empurre de volta.'),
  ('Prancha frontal', 'core', 'Peso corporal', 'Antebraços no chão, corpo alinhado da cabeça aos calcanhares. Contraia o abdômen e mantenha a posição.'),
  ('Abdominal supra', 'core', 'Peso corporal', 'Deitado com joelhos flexionados. Eleve os ombros do chão contraindo o abdômen, sem puxar o pescoço.'),
  ('Elevação de pernas', 'core', 'Peso corporal', 'Deitado, pernas estendidas. Eleve as pernas até 90 graus e desça devagar sem tirar a lombar do chão.'),
  ('Agachamento livre', 'quadriceps', 'Barra', 'Pés na largura dos ombros. Desça como se fosse sentar, joelhos na direção dos pés e coluna neutra; suba empurrando o chão.'),
  ('Agachamento goblet', 'quadriceps', 'Halter ou kettlebell', 'Segure o peso junto ao peito. Agache mantendo o tronco ereto e os cotovelos entre os joelhos.'),
  ('Leg press 45', 'quadriceps', 'Leg press', 'Pés na largura do quadril. Desça até cerca de 90 graus nos joelhos sem tirar a lombar do encosto e empurre.'),
  ('Cadeira extensora', 'quadriceps', 'Cadeira extensora', 'Estenda os joelhos até quase travar, segure um instante e desça controlando.'),
  ('Afundo', 'quadriceps', 'Halteres ou peso corporal', 'Dê um passo à frente e desça até os dois joelhos ficarem perto de 90 graus. Volte empurrando com a perna da frente.'),
  ('Levantamento terra romeno', 'hamstrings', 'Barra ou halteres', 'Joelhos levemente flexionados. Leve o quadril para trás descendo o peso rente às pernas, coluna neutra; volte contraindo os glúteos.'),
  ('Mesa flexora', 'hamstrings', 'Mesa flexora', 'Deitado de bruços. Flexione os joelhos levando o rolo em direção aos glúteos e desça devagar.'),
  ('Elevação pélvica', 'glutes', 'Barra e banco', 'Costas apoiadas no banco, barra sobre o quadril. Eleve o quadril até alinhar com o tronco e contraia os glúteos no topo.'),
  ('Abdução de quadril na máquina', 'glutes', 'Máquina abdutora', 'Afaste as pernas contra a resistência e volte devagar, sem deixar o peso bater.'),
  ('Panturrilha em pé', 'calves', 'Máquina ou degrau', 'Suba na ponta dos pés o mais alto possível, segure um instante e desça alongando.'),
  ('Burpee', 'full_body', 'Peso corporal', 'Agache, apoie as mãos, leve os pés para trás, volte e salte com os braços para cima.'),
  ('Kettlebell swing', 'full_body', 'Kettlebell', 'Movimento vem do quadril: leve o quadril para trás e projete à frente balançando o peso até a altura do peito.'),
  ('Esteira', 'cardio', 'Esteira', 'Mantenha a postura ereta e o ritmo indicado pelo treinador.'),
  ('Bicicleta ergométrica', 'cardio', 'Bicicleta', 'Ajuste o banco para o joelho ficar levemente flexionado no ponto mais baixo.'),
  ('Mobilidade de quadril 90/90', 'mobility', 'Peso corporal', 'Sentado com as duas pernas em 90 graus. Gire de um lado para o outro mantendo o tronco ereto.'),
  ('Rotação torácica', 'mobility', 'Peso corporal', 'De quatro apoios, mão atrás da cabeça. Gire o tronco abrindo o cotovelo em direção ao teto.');
