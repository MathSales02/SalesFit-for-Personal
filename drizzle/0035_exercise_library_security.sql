-- Exercise library: constraints for the new fields and the enriched platform library.

ALTER TABLE exercises ADD CONSTRAINT exercises_details_ck CHECK (
  length(tips) <= 2000 AND length(common_mistakes) <= 2000
  AND cardinality(secondary_muscles) <= 6
  AND NOT (muscle_group = ANY (secondary_muscles))
  AND (video_url IS NULL OR video_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$')
);
--> statement-breakpoint
CREATE INDEX exercises_source_idx ON exercises (workspace_id, source_exercise_id) WHERE source_exercise_id IS NOT NULL;
--> statement-breakpoint

-- Platform library (workspace_id NULL). Trainers' own exercises and copies are never touched.
CREATE TEMP TABLE _library (name text, muscle_group text, secondary text, equipment text, difficulty text, description text, instructions text, tips text, common_mistakes text);
--> statement-breakpoint
INSERT INTO _library VALUES
  ('Supino reto com barra', 'chest', '{triceps,shoulders}', 'Barra e banco', 'intermediate', 'Exercício base para o peitoral, feito deitado no banco reto empurrando a barra para cima.', 'Deite no banco com os olhos sob a barra, pés firmes no chão e escápulas unidas.
Segure a barra um pouco além da largura dos ombros e tire do suporte com os braços estendidos.
Desça a barra com controle até tocar de leve a linha do peito.
Empurre até estender os cotovelos, sem tirar as escápulas do banco.', 'Mantenha os punhos alinhados com os cotovelos.
Use os pés para dar estabilidade, sem tirar o quadril do banco.', 'Quicar a barra no peito.
Abrir os cotovelos a 90 graus do tronco.
Tirar o quadril do banco para empurrar.'),
  ('Supino reto com halteres', 'chest', '{triceps,shoulders}', 'Halteres e banco', 'beginner', 'Variação do supino com halteres, que permite maior amplitude e trabalha cada lado de forma independente.', 'Deite no banco reto com um halter em cada mão na altura do peito.
Empurre os halteres para cima até quase estender os cotovelos.
Desça devagar até os halteres ficarem ao lado do peito.', 'Mantenha as escápulas unidas durante todo o movimento.
Desça até sentir o peitoral alongar, sem dor no ombro.', 'Bater os halteres no topo.
Descer rápido demais e perder o controle.'),
  ('Supino inclinado com halteres', 'chest', '{shoulders,triceps}', 'Halteres e banco inclinado', 'intermediate', 'Supino no banco inclinado, com ênfase na parte superior do peitoral.', 'Ajuste o banco entre 30 e 45 graus e deite com um halter em cada mão.
Desça os halteres ao lado da parte de cima do peito.
Empurre para cima aproximando os halteres no topo, sem bater.', 'Inclinações acima de 45 graus transferem o esforço para os ombros.
Mantenha os cotovelos um pouco abaixo da linha dos ombros.', 'Arquear demais a lombar.
Usar uma inclinação muito alta.'),
  ('Supino declinado com barra', 'chest', '{triceps,shoulders}', 'Barra e banco declinado', 'intermediate', 'Supino no banco declinado, com ênfase na parte inferior do peitoral.', 'Prenda os pés no apoio do banco declinado e deite com os olhos sob a barra.
Tire a barra do suporte e desça com controle até a parte de baixo do peito.
Empurre até estender os cotovelos.', 'Peça ajuda para tirar e devolver a barra ao suporte.
Mantenha as escápulas unidas e apoiadas no banco.', 'Descer a barra em direção ao pescoço.
Soltar os pés do apoio durante a série.'),
  ('Crucifixo com halteres', 'chest', '{shoulders}', 'Halteres e banco', 'beginner', 'Movimento de abertura dos braços que isola o peitoral.', 'Deite no banco com os halteres acima do peito e os cotovelos levemente flexionados.
Abra os braços em arco até sentir o alongamento do peito.
Volte pelo mesmo caminho, aproximando os halteres acima do peito.', 'Mantenha a mesma flexão dos cotovelos do início ao fim.
Use cargas moderadas: é um exercício de controle.', 'Descer além do limite confortável dos ombros.
Transformar o movimento em um supino, flexionando demais os cotovelos.'),
  ('Crossover na polia', 'chest', '{shoulders}', 'Polias (cross over)', 'intermediate', 'Exercício nas polias altas que mantém o peitoral sob tensão durante todo o movimento.', 'Fique no centro das polias altas, um pé à frente, tronco levemente inclinado.
Com os cotovelos levemente flexionados, traga as mãos para frente e para baixo até se encontrarem.
Volte devagar até sentir o peitoral alongar.', 'Segure um instante com as mãos juntas para contrair o peitoral.
Mantenha o tronco parado durante a série.', 'Usar o peso do corpo para puxar as polias.
Deixar os ombros subirem em direção às orelhas.'),
  ('Peck deck', 'chest', '{shoulders}', 'Máquina peck deck', 'beginner', 'Máquina de crucifixo sentado, que isola o peitoral com trajetória guiada.', 'Ajuste o banco para as mãos ficarem na altura do peito e apoie as costas.
Feche os braços à frente do corpo até as mãos quase se tocarem.
Volte devagar até a linha dos ombros.', 'Mantenha as costas e a cabeça apoiadas no encosto.
Controle a volta: não deixe as placas baterem.', 'Abrir os braços além da linha dos ombros.
Projetar os ombros para frente ao fechar.'),
  ('Flexão de braço', 'chest', '{triceps,shoulders,core}', 'Peso corporal', 'beginner', 'Exercício clássico com o peso do corpo para peitoral, tríceps e ombros.', 'Apoie as mãos no chão um pouco além da largura dos ombros, corpo alinhado da cabeça aos calcanhares.
Desça até o peito quase tocar o chão, cotovelos a cerca de 45 graus do tronco.
Empurre o chão até estender os braços.', 'Contraia abdômen e glúteos para manter o corpo reto.
Se estiver difícil, apoie os joelhos no chão.', 'Deixar o quadril cair ou subir.
Fazer só metade da amplitude.'),
  ('Puxada frontal', 'back', '{biceps,forearms}', 'Polia alta', 'beginner', 'Puxada na polia alta que trabalha a largura das costas.', 'Sente com as coxas presas no apoio e segure a barra com pegada aberta.
Puxe a barra até a parte de cima do peito, levando os cotovelos para baixo e para trás.
Volte devagar até estender os braços.', 'Inicie o movimento abaixando os ombros, antes de dobrar os cotovelos.
Incline o tronco só um pouco para trás.', 'Puxar a barra atrás da nuca.
Balançar o tronco para ganhar impulso.'),
  ('Remada baixa na polia', 'back', '{biceps,forearms}', 'Polia baixa e triângulo', 'beginner', 'Remada sentada na polia baixa, para o meio das costas.', 'Sente com os pés no apoio, joelhos levemente flexionados e coluna ereta.
Puxe o triângulo em direção ao abdômen, levando os cotovelos para trás.
Volte devagar até estender os braços, sem curvar as costas.', 'Aproxime as escápulas no fim da puxada.
Mantenha o tronco quase parado.', 'Jogar o tronco para trás a cada repetição.
Arredondar a lombar na volta.'),
  ('Remada curvada com barra', 'back', '{biceps,hamstrings,core}', 'Barra', 'intermediate', 'Remada livre com o tronco inclinado, para a espessura das costas.', 'Segure a barra, flexione levemente os joelhos e incline o tronco à frente com a coluna neutra.
Puxe a barra em direção ao umbigo, cotovelos próximos ao corpo.
Desça devagar até estender os braços.', 'Mantenha o abdômen contraído para proteger a lombar.
O tronco não deve subir durante a puxada.', 'Arredondar as costas.
Usar o impulso das pernas e do tronco.'),
  ('Remada unilateral com halter', 'back', '{biceps}', 'Halter e banco', 'beginner', 'Remada com um braço de cada vez, com apoio no banco.', 'Apoie a mão e o joelho do mesmo lado no banco, costas paralelas ao chão.
Puxe o halter junto ao corpo até a cintura.
Desça devagar até estender o braço.', 'Pense em levar o cotovelo para trás, não a mão para cima.
Mantenha o pescoço alinhado com a coluna.', 'Girar o tronco para subir o halter.
Encolher o ombro em direção à orelha.'),
  ('Remada cavalinho', 'back', '{biceps,forearms}', 'Barra T', 'intermediate', 'Remada na barra T, com o tronco inclinado, para a espessura das costas.', 'Posicione-se sobre a barra, joelhos flexionados e coluna neutra.
Puxe a barra em direção ao peito, aproximando as escápulas.
Desça com controle até estender os braços.', 'Mantenha o peito aberto durante toda a série.
Prefira a versão com apoio no peito se sentir a lombar.', 'Arredondar a lombar.
Subir o tronco a cada repetição.'),
  ('Pulldown com braços estendidos', 'back', '{triceps,core}', 'Polia alta', 'intermediate', 'Puxada com os braços estendidos que isola o grande dorsal.', 'De pé em frente à polia alta, segure a barra com os braços estendidos à frente.
Leve a barra em arco até as coxas, sem dobrar os cotovelos.
Volte devagar até a altura dos ombros.', 'Incline levemente o tronco e mantenha o abdômen firme.
Cotovelos apenas destravados, do início ao fim.', 'Dobrar os cotovelos e transformar em tríceps.
Usar carga que obrigue a balançar o corpo.'),
  ('Barra fixa', 'back', '{biceps,forearms,core}', 'Barra fixa', 'advanced', 'Puxada com o peso do corpo, uma das mais completas para as costas.', 'Segure a barra com pegada pronada, um pouco além da largura dos ombros, braços estendidos.
Suba até o queixo passar a barra, levando os cotovelos para baixo.
Desça com controle até estender os braços.', 'Comece abaixando os ombros antes de puxar.
Use elástico ou a máquina graviton se ainda não consegue repetições completas.', 'Balançar o corpo para subir.
Não estender os braços na descida.'),
  ('Desenvolvimento com halteres', 'shoulders', '{triceps}', 'Halteres e banco', 'intermediate', 'Empurrar os halteres acima da cabeça, sentado, para os deltoides.', 'Sente com as costas apoiadas e os halteres na altura das orelhas.
Empurre para cima até quase estender os cotovelos.
Desça devagar até a posição inicial.', 'Mantenha os punhos sobre os cotovelos.
Abdômen firme para não arquear a lombar.', 'Arquear as costas para empurrar.
Descer só até metade do caminho.'),
  ('Desenvolvimento militar com barra', 'shoulders', '{triceps,core}', 'Barra', 'intermediate', 'Desenvolvimento em pé com barra, que exige estabilidade do tronco.', 'Em pé, barra apoiada na parte de cima do peito, pegada pouco além dos ombros.
Empurre a barra acima da cabeça até estender os braços.
Desça com controle até a parte de cima do peito.', 'Contraia glúteos e abdômen para manter o tronco firme.
Afaste levemente a cabeça para a barra passar em linha reta.', 'Inclinar o tronco para trás.
Usar impulso das pernas.'),
  ('Elevação lateral', 'shoulders', '{}', 'Halteres', 'beginner', 'Elevação dos braços pelas laterais, para a porção lateral do deltoide.', 'Em pé, halteres ao lado do corpo e cotovelos levemente flexionados.
Eleve os braços pelas laterais até a altura dos ombros.
Desça devagar.', 'Pense em afastar os halteres do corpo, não em levantá-los.
Cargas leves e controle funcionam melhor aqui.', 'Subir acima da linha dos ombros encolhendo o trapézio.
Balançar o tronco para ganhar impulso.'),
  ('Elevação frontal', 'shoulders', '{chest}', 'Halteres ou anilha', 'beginner', 'Elevação dos braços à frente do corpo, para a porção anterior do deltoide.', 'Em pé, halteres à frente das coxas.
Eleve os braços à frente até a altura dos ombros.
Desça devagar até a posição inicial.', 'Pode ser feito alternando os braços.
Mantenha o tronco imóvel.', 'Inclinar o tronco para trás.
Subir os halteres acima da cabeça.'),
  ('Crucifixo inverso', 'shoulders', '{back}', 'Halteres ou máquina', 'beginner', 'Abertura dos braços para trás, para a porção posterior do deltoide.', 'Incline o tronco à frente com a coluna neutra, halteres abaixo do peito.
Abra os braços para os lados até a linha dos ombros.
Volte devagar.', 'Cotovelos levemente flexionados e fixos.
Na máquina, ajuste o banco para as mãos ficarem na altura dos ombros.', 'Puxar com as costas, juntando demais as escápulas.
Usar impulso do tronco.'),
  ('Face pull', 'shoulders', '{back}', 'Polia e corda', 'beginner', 'Puxada da corda em direção ao rosto, para deltoide posterior e saúde dos ombros.', 'Ajuste a polia na altura do rosto e segure a corda com as duas mãos.
Puxe em direção à testa, abrindo as mãos e afastando os cotovelos.
Volte devagar até estender os braços.', 'Termine com as mãos ao lado das orelhas.
Use carga leve e movimento controlado.', 'Puxar em direção ao peito.
Inclinar o corpo para trás.'),
  ('Rosca direta com barra', 'biceps', '{forearms}', 'Barra', 'beginner', 'Flexão de cotovelos com barra, o exercício base para bíceps.', 'Em pé, segure a barra com as palmas para cima e os cotovelos junto ao corpo.
Flexione os cotovelos até a barra chegar perto dos ombros.
Desça devagar até estender os braços.', 'Mantenha os cotovelos parados ao lado do tronco.
A barra W alivia os punhos.', 'Balançar o tronco para subir a barra.
Levar os cotovelos para frente.'),
  ('Rosca alternada com halteres', 'biceps', '{forearms}', 'Halteres', 'beginner', 'Rosca com um braço de cada vez, girando o punho durante a subida.', 'Em pé ou sentado, halteres ao lado do corpo com as palmas voltadas para dentro.
Flexione um cotovelo girando a palma para cima.
Desça devagar e repita com o outro braço.', 'Gire o punho logo no início da subida.
Mantenha o ombro parado.', 'Usar impulso do corpo.
Não descer até estender o braço.'),
  ('Rosca martelo', 'biceps', '{forearms}', 'Halteres', 'beginner', 'Rosca com pegada neutra, que trabalha bíceps, braquial e antebraço.', 'Em pé, halteres ao lado do corpo com as palmas voltadas uma para a outra.
Flexione os cotovelos mantendo a pegada neutra.
Desça devagar.', 'Cotovelos fixos ao lado do corpo.
Pode ser feita alternando os braços.', 'Girar os punhos durante o movimento.
Balançar o tronco.'),
  ('Rosca Scott', 'biceps', '{forearms}', 'Banco Scott e barra W', 'intermediate', 'Rosca com os braços apoiados no banco Scott, que impede o uso de impulso.', 'Apoie a parte de trás dos braços no banco e segure a barra com as palmas para cima.
Flexione os cotovelos até a barra se aproximar dos ombros.
Desça devagar até quase estender os braços.', 'Ajuste o banco para as axilas ficarem na borda do apoio.
Controle bem a descida.', 'Estender os cotovelos de forma brusca no final.
Tirar os braços do apoio.'),
  ('Rosca concentrada', 'biceps', '{}', 'Halter e banco', 'beginner', 'Rosca unilateral sentada, com o cotovelo apoiado na coxa.', 'Sente no banco com as pernas afastadas e apoie o cotovelo na parte interna da coxa.
Flexione o cotovelo levando o halter em direção ao ombro.
Desça devagar até estender o braço.', 'Segure um instante no topo.
Mantenha o tronco parado.', 'Usar o ombro para subir o halter.
Tirar o cotovelo da coxa.'),
  ('Tríceps na polia', 'triceps', '{}', 'Polia alta', 'beginner', 'Extensão dos cotovelos na polia alta, com barra ou corda.', 'Em pé em frente à polia, cotovelos fixos ao lado do corpo.
Estenda os braços até o fim.
Volte devagar até os antebraços passarem um pouco de 90 graus.', 'Com a corda, afaste as mãos no final do movimento.
Mantenha os ombros para baixo.', 'Afastar os cotovelos do corpo.
Inclinar o tronco sobre a barra.'),
  ('Tríceps francês com halter', 'triceps', '{}', 'Halter', 'intermediate', 'Extensão dos cotovelos com o halter acima da cabeça.', 'Sentado ou em pé, segure o halter com as duas mãos acima da cabeça.
Desça o halter atrás da cabeça flexionando os cotovelos.
Estenda os braços de volta.', 'Mantenha os cotovelos apontando para frente.
Abdômen firme para não arquear a lombar.', 'Abrir demais os cotovelos.
Arquear as costas.'),
  ('Tríceps testa', 'triceps', '{}', 'Barra W e banco', 'intermediate', 'Extensão dos cotovelos deitado, com a barra descendo em direção à testa.', 'Deite no banco com a barra acima do peito, braços estendidos.
Flexione só os cotovelos, descendo a barra em direção à testa.
Estenda os braços de volta.', 'Mantenha os braços parados: só os antebraços se movem.
Desça com controle.', 'Abrir os cotovelos para os lados.
Mover os ombros e transformar em supino.'),
  ('Mergulho no banco', 'triceps', '{chest,shoulders}', 'Banco', 'beginner', 'Mergulho com as mãos apoiadas no banco atrás do corpo.', 'Apoie as mãos na borda do banco, pernas à frente.
Desça flexionando os cotovelos até cerca de 90 graus.
Empurre de volta até estender os braços.', 'Mantenha as costas próximas ao banco.
Flexione os joelhos para facilitar.', 'Descer além do confortável para os ombros.
Abrir os cotovelos para os lados.'),
  ('Mergulho nas paralelas', 'triceps', '{chest,shoulders}', 'Barras paralelas', 'advanced', 'Mergulho com o peso do corpo nas barras paralelas.', 'Suba nas paralelas com os braços estendidos e o tronco quase reto.
Desça flexionando os cotovelos até cerca de 90 graus.
Empurre até estender os braços.', 'Tronco mais reto enfatiza o tríceps; inclinado, o peitoral.
Use a máquina graviton se ainda não consegue repetições completas.', 'Descer rápido e sem controle.
Encolher os ombros.'),
  ('Rosca de punho', 'forearms', '{}', 'Barra ou halteres', 'beginner', 'Flexão dos punhos com os antebraços apoiados, para os flexores do antebraço.', 'Sente e apoie os antebraços nas coxas, palmas para cima e punhos para fora dos joelhos.
Flexione os punhos levando a barra para cima.
Desça devagar, deixando os punhos estenderem.', 'Mantenha os antebraços apoiados o tempo todo.
Use cargas leves e mais repetições.', 'Levantar os antebraços do apoio.
Fazer o movimento com pressa.'),
  ('Rosca inversa', 'forearms', '{biceps}', 'Barra', 'beginner', 'Rosca com as palmas para baixo, que trabalha os extensores do antebraço e o braquiorradial.', 'Em pé, segure a barra com as palmas voltadas para baixo.
Flexione os cotovelos até a barra chegar perto dos ombros.
Desça devagar.', 'Mantenha os punhos retos.
Cotovelos fixos ao lado do corpo.', 'Dobrar os punhos para trás.
Balançar o tronco.'),
  ('Caminhada do fazendeiro', 'forearms', '{core,shoulders}', 'Halteres ou kettlebells', 'intermediate', 'Caminhar carregando peso nas mãos, para força de pegada e estabilidade do tronco.', 'Segure um peso em cada mão, ao lado do corpo, com postura ereta.
Caminhe em passos curtos e firmes pela distância combinada.
Apoie os pesos no chão com a coluna neutra.', 'Ombros para trás e abdômen firme.
Aperte bem os pesos durante todo o percurso.', 'Inclinar o tronco para os lados.
Arredondar as costas ao pegar ou soltar os pesos.'),
  ('Prancha frontal', 'core', '{shoulders}', 'Peso corporal', 'beginner', 'Exercício isométrico para a estabilidade do tronco.', 'Apoie os antebraços e as pontas dos pés no chão, cotovelos sob os ombros.
Alinhe o corpo da cabeça aos calcanhares.
Contraia abdômen e glúteos e mantenha a posição pelo tempo combinado.', 'Respire normalmente.
Prefira séries curtas e bem feitas a séries longas com a postura perdida.', 'Deixar o quadril cair.
Elevar demais o quadril.'),
  ('Prancha lateral', 'core', '{shoulders}', 'Peso corporal', 'beginner', 'Prancha de lado, com ênfase nos oblíquos.', 'Deite de lado e apoie o antebraço no chão, cotovelo sob o ombro.
Eleve o quadril até alinhar o corpo.
Mantenha a posição pelo tempo combinado e troque de lado.', 'Apoie o joelho de baixo no chão para facilitar.
Mantenha o quadril projetado à frente.', 'Deixar o quadril cair.
Girar o tronco para frente.'),
  ('Abdominal supra', 'core', '{}', 'Peso corporal', 'beginner', 'Flexão do tronco deitado, para a parte superior do abdômen.', 'Deite com os joelhos flexionados e os pés no chão.
Eleve os ombros do chão contraindo o abdômen.
Desça devagar.', 'Olhe para o teto para manter o pescoço neutro.
Solte o ar ao subir.', 'Puxar o pescoço com as mãos.
Subir usando impulso.'),
  ('Abdominal bicicleta', 'core', '{}', 'Peso corporal', 'beginner', 'Abdominal com rotação do tronco, que trabalha reto abdominal e oblíquos.', 'Deite com as mãos ao lado da cabeça e as pernas elevadas.
Leve um cotovelo em direção ao joelho oposto enquanto estende a outra perna.
Alterne os lados de forma contínua e controlada.', 'Gire o tronco, não só os cotovelos.
Mantenha a lombar apoiada no chão.', 'Fazer rápido demais.
Puxar o pescoço.'),
  ('Elevação de pernas', 'core', '{}', 'Peso corporal', 'intermediate', 'Elevação das pernas deitado, com ênfase na parte inferior do abdômen.', 'Deite com as pernas estendidas e as mãos ao lado do corpo.
Eleve as pernas até cerca de 90 graus.
Desça devagar, sem encostar os pés no chão.', 'Mantenha a lombar apoiada no chão.
Flexione um pouco os joelhos se sentir a lombar.', 'Arquear a lombar na descida.
Usar impulso.'),
  ('Abdominal na polia', 'core', '{}', 'Polia alta e corda', 'intermediate', 'Abdominal ajoelhado com carga, na polia alta.', 'Ajoelhe em frente à polia e segure a corda ao lado da cabeça.
Flexione o tronco levando os cotovelos em direção às coxas.
Volte devagar, sem perder a tensão do abdômen.', 'O quadril fica parado: o movimento é do tronco.
Solte o ar ao descer.', 'Puxar com os braços.
Sentar sobre os calcanhares a cada repetição.'),
  ('Agachamento livre', 'quadriceps', '{glutes,hamstrings,core}', 'Barra', 'intermediate', 'Agachamento com a barra nas costas, o exercício base para as pernas.', 'Apoie a barra na parte de cima das costas, pés na largura dos ombros.
Desça como se fosse sentar, joelhos na direção dos pés e coluna neutra.
Suba empurrando o chão até estender quadril e joelhos.', 'Inspire antes de descer e mantenha o abdômen firme.
Desça até onde conseguir manter a coluna neutra.', 'Deixar os joelhos caírem para dentro.
Tirar os calcanhares do chão.
Arredondar a lombar no fundo.'),
  ('Agachamento goblet', 'quadriceps', '{glutes,core}', 'Halter ou kettlebell', 'beginner', 'Agachamento segurando o peso junto ao peito, ótimo para aprender o movimento.', 'Segure o peso junto ao peito, pés na largura dos ombros.
Agache mantendo o tronco ereto, cotovelos entre os joelhos.
Suba empurrando o chão.', 'O peso à frente ajuda a manter o tronco ereto.
Calcanhares sempre no chão.', 'Afastar o peso do peito.
Inclinar demais o tronco à frente.'),
  ('Agachamento búlgaro', 'quadriceps', '{glutes,hamstrings}', 'Halteres e banco', 'intermediate', 'Agachamento unilateral com o pé de trás apoiado no banco.', 'De costas para o banco, apoie o peito de um pé nele e dê um passo à frente.
Desça até a coxa da frente ficar paralela ao chão.
Suba empurrando com a perna da frente.', 'Tronco levemente inclinado enfatiza os glúteos.
Complete as repetições de um lado antes de trocar.', 'Ficar perto demais do banco.
Deixar o joelho da frente cair para dentro.'),
  ('Agachamento hack', 'quadriceps', '{glutes}', 'Máquina hack', 'intermediate', 'Agachamento na máquina hack, com trajetória guiada e as costas apoiadas.', 'Apoie costas e ombros na máquina, pés na largura dos ombros na plataforma.
Destrave e desça até cerca de 90 graus nos joelhos.
Empurre a plataforma até quase estender os joelhos.', 'Mantenha a lombar apoiada no encosto.
Pés mais baixos na plataforma aumentam o trabalho dos quadríceps.', 'Travar os joelhos no topo.
Tirar os calcanhares da plataforma.'),
  ('Leg press 45', 'quadriceps', '{glutes,hamstrings}', 'Leg press', 'beginner', 'Empurrar a plataforma inclinada com as pernas, sentado e com as costas apoiadas.', 'Sente com as costas apoiadas e os pés na largura do quadril na plataforma.
Destrave e desça até cerca de 90 graus nos joelhos.
Empurre até quase estender os joelhos.', 'Mantenha a lombar apoiada no encosto durante todo o movimento.
Joelhos alinhados com os pés.', 'Descer tanto que a lombar sai do encosto.
Travar os joelhos no final.
Empurrar os joelhos com as mãos.'),
  ('Cadeira extensora', 'quadriceps', '{}', 'Cadeira extensora', 'beginner', 'Extensão dos joelhos na máquina, que isola os quadríceps.', 'Ajuste o encosto para os joelhos ficarem alinhados ao eixo da máquina.
Estenda os joelhos até quase travar e segure um instante.
Desça controlando.', 'O rolo deve ficar logo acima dos tornozelos.
Segure nas alças para manter o quadril no banco.', 'Deixar o peso despencar na volta.
Tirar o quadril do banco.'),
  ('Afundo', 'quadriceps', '{glutes,hamstrings}', 'Halteres ou peso corporal', 'beginner', 'Passo à frente com flexão dos dois joelhos, trabalhando uma perna de cada vez.', 'Em pé, dê um passo largo à frente.
Desça até os dois joelhos ficarem perto de 90 graus.
Volte empurrando com a perna da frente.', 'Mantenha o tronco ereto.
O joelho de trás desce em direção ao chão, sem bater.', 'Dar um passo curto demais.
Deixar o joelho da frente cair para dentro.'),
  ('Levantamento terra romeno', 'hamstrings', '{glutes,back}', 'Barra ou halteres', 'intermediate', 'Flexão do quadril com os joelhos pouco flexionados, para posteriores de coxa e glúteos.', 'Em pé, segure a barra à frente das coxas, joelhos levemente flexionados.
Leve o quadril para trás descendo a barra rente às pernas, coluna neutra.
Suba contraindo os glúteos até ficar ereto.', 'Desça até sentir os posteriores alongarem, em geral logo abaixo dos joelhos.
A barra nunca se afasta das pernas.', 'Arredondar as costas.
Dobrar os joelhos e transformar em agachamento.'),
  ('Stiff com halteres', 'hamstrings', '{glutes,back}', 'Halteres', 'intermediate', 'Flexão do quadril com as pernas quase estendidas, com ênfase no alongamento dos posteriores.', 'Em pé, halteres à frente das coxas e joelhos apenas destravados.
Incline o tronco à frente levando o quadril para trás, coluna neutra.
Volte à posição inicial contraindo glúteos e posteriores.', 'Mantenha os halteres próximos às pernas.
Olhe para um ponto no chão à frente para manter o pescoço neutro.', 'Arredondar a lombar para descer mais.
Travar completamente os joelhos.'),
  ('Mesa flexora', 'hamstrings', '{calves}', 'Mesa flexora', 'beginner', 'Flexão dos joelhos deitado de bruços, que isola os posteriores de coxa.', 'Deite de bruços com os joelhos alinhados ao eixo da máquina.
Flexione os joelhos levando o rolo em direção aos glúteos.
Desça devagar.', 'Mantenha o quadril apoiado no banco.
O rolo fica logo acima dos calcanhares.', 'Levantar o quadril para ajudar.
Deixar o peso despencar na volta.'),
  ('Cadeira flexora', 'hamstrings', '{}', 'Cadeira flexora', 'beginner', 'Flexão dos joelhos sentado, para os posteriores de coxa.', 'Sente com as costas apoiadas e ajuste o apoio sobre as coxas.
Flexione os joelhos levando o rolo para baixo e para trás.
Volte devagar até quase estender os joelhos.', 'Joelhos alinhados ao eixo da máquina.
Segure um instante no fim da flexão.', 'Tirar as costas do encosto.
Voltar sem controle.'),
  ('Elevação pélvica', 'glutes', '{hamstrings}', 'Barra e banco', 'intermediate', 'Extensão do quadril com as costas apoiadas no banco, o principal exercício para glúteos.', 'Apoie a parte de cima das costas no banco, barra sobre o quadril e pés no chão.
Eleve o quadril até alinhar com o tronco.
Contraia os glúteos no topo e desça devagar.', 'Queixo levemente recolhido e costelas para baixo.
No topo, as canelas ficam na vertical.', 'Arquear a lombar no topo.
Empurrar com as pontas dos pés.'),
  ('Ponte de glúteos', 'glutes', '{hamstrings,core}', 'Peso corporal', 'beginner', 'Elevação do quadril deitado no chão, versão inicial da elevação pélvica.', 'Deite com os joelhos flexionados e os pés no chão, na largura do quadril.
Eleve o quadril até alinhar joelhos, quadril e ombros.
Contraia os glúteos no topo e desça devagar.', 'Empurre o chão com os calcanhares.
Pode ser feita com uma perna de cada vez.', 'Arquear a lombar.
Subir com pressa, sem contrair no topo.'),
  ('Coice na polia', 'glutes', '{hamstrings}', 'Polia baixa e tornozeleira', 'beginner', 'Extensão do quadril na polia, uma perna de cada vez.', 'Prenda a tornozeleira, fique de frente para a polia e apoie as mãos na máquina.
Leve a perna para trás estendendo o quadril.
Volte devagar.', 'Tronco levemente inclinado e abdômen firme.
Segure um instante com a perna atrás.', 'Arquear a lombar para subir mais a perna.
Balançar a perna com impulso.'),
  ('Abdução de quadril na máquina', 'glutes', '{}', 'Máquina abdutora', 'beginner', 'Afastar as pernas contra a resistência, para glúteo médio.', 'Sente com as costas apoiadas e as pernas contra os apoios.
Afaste as pernas o máximo que conseguir com controle.
Volte devagar, sem deixar o peso bater.', 'Inclinar um pouco o tronco à frente aumenta o trabalho dos glúteos.
Segure um instante com as pernas afastadas.', 'Voltar sem controle.
Usar impulso do tronco.'),
  ('Panturrilha em pé', 'calves', '{}', 'Máquina ou degrau', 'beginner', 'Elevação dos calcanhares em pé, para o gastrocnêmio.', 'Apoie a parte da frente dos pés no degrau, joelhos estendidos.
Suba na ponta dos pés o mais alto possível e segure um instante.
Desça alongando, com os calcanhares abaixo do degrau.', 'Use a amplitude completa.
Movimento lento rende mais do que carga alta.', 'Quicar no fundo do movimento.
Dobrar os joelhos para ajudar.'),
  ('Panturrilha sentado', 'calves', '{}', 'Máquina de panturrilha sentado', 'beginner', 'Elevação dos calcanhares sentado, com ênfase no sóleo.', 'Sente com os joelhos sob o apoio e a parte da frente dos pés na plataforma.
Eleve os calcanhares o mais alto possível.
Desça devagar até alongar.', 'Segure um instante no topo.
Mantenha os pés paralelos.', 'Fazer repetições curtas e rápidas.
Usar o tronco para empurrar o apoio.'),
  ('Panturrilha no leg press', 'calves', '{}', 'Leg press', 'beginner', 'Elevação dos calcanhares no leg press, com as pernas estendidas.', 'No leg press, apoie só a parte da frente dos pés na borda da plataforma.
Empurre com as pontas dos pés, estendendo os tornozelos.
Volte devagar até alongar as panturrilhas.', 'Mantenha as travas de segurança ao alcance.
Joelhos estendidos, sem travar.', 'Dobrar os joelhos durante o movimento.
Deixar os pés escorregarem da plataforma.'),
  ('Levantamento terra', 'full_body', '{hamstrings,glutes,back}', 'Barra', 'advanced', 'Levantar a barra do chão até ficar ereto: um dos exercícios mais completos de força.', 'Pés na largura do quadril, barra sobre o meio dos pés; segure-a com a coluna neutra.
Empurre o chão e suba a barra rente às pernas até estender quadril e joelhos.
Desça levando o quadril para trás, com a barra junto ao corpo.', 'Tensione o corpo antes de tirar a barra do chão.
Quadril e ombros sobem juntos.', 'Arredondar as costas.
Puxar com os braços.
Afastar a barra do corpo.'),
  ('Burpee', 'full_body', '{}', 'Peso corporal', 'intermediate', 'Sequência de agachamento, prancha e salto, para condicionamento.', 'Em pé, agache e apoie as mãos no chão.
Leve os pés para trás até a posição de prancha.
Traga os pés de volta e salte com os braços para cima.', 'Mantenha o abdômen firme na prancha.
Sem salto e sem flexão, o exercício fica mais leve.', 'Deixar o quadril cair na prancha.
Aterrissar com os joelhos travados.'),
  ('Kettlebell swing', 'full_body', '{glutes,hamstrings,core}', 'Kettlebell', 'intermediate', 'Balanço do kettlebell com a força do quadril.', 'Pés um pouco além da largura dos ombros, kettlebell à frente no chão.
Leve o peso para trás entre as pernas, com o quadril para trás e a coluna neutra.
Projete o quadril à frente, balançando o peso até a altura do peito.', 'O movimento vem do quadril, não dos braços.
Contraia glúteos e abdômen no topo.', 'Agachar em vez de dobrar o quadril.
Levantar o peso com os ombros.'),
  ('Thruster', 'full_body', '{quadriceps,shoulders,glutes}', 'Barra ou halteres', 'intermediate', 'Agachamento seguido de desenvolvimento, em um único movimento.', 'Em pé, peso apoiado na altura dos ombros.
Agache com o tronco ereto.
Suba com força e aproveite o impulso para empurrar o peso acima da cabeça.', 'Mantenha os cotovelos altos no agachamento.
Respire no topo de cada repetição.', 'Deixar os cotovelos caírem.
Separar o agachamento do desenvolvimento, perdendo o impulso.'),
  ('Esteira', 'cardio', '{}', 'Esteira', 'beginner', 'Caminhada ou corrida na esteira.', 'Comece caminhando para aquecer.
Aumente a velocidade até o ritmo indicado pelo treinador.
Reduza a velocidade aos poucos antes de parar.', 'Mantenha a postura ereta e o olhar à frente.
Evite segurar nas barras laterais.', 'Passadas longas demais.
Olhar para os pés.'),
  ('Bicicleta ergométrica', 'cardio', '{}', 'Bicicleta', 'beginner', 'Pedalada na bicicleta ergométrica.', 'Ajuste o banco para o joelho ficar levemente flexionado no ponto mais baixo.
Pedale no ritmo e na carga indicados pelo treinador.
Reduza o ritmo aos poucos antes de parar.', 'Mantenha os ombros relaxados.
Pedale com a parte da frente dos pés.', 'Banco baixo demais.
Balançar o quadril de um lado para o outro.'),
  ('Mobilidade de quadril 90/90', 'mobility', '{}', 'Peso corporal', 'beginner', 'Rotação do quadril sentado, com as duas pernas em 90 graus.', 'Sente com uma perna à frente e outra ao lado, ambas flexionadas a 90 graus.
Gire os joelhos para o outro lado, sem tirar os pés do chão.
Alterne os lados de forma lenta e controlada.', 'Mantenha o tronco ereto.
Apoie as mãos atrás do corpo se precisar.', 'Forçar além do confortável.
Curvar as costas.'),
  ('Rotação torácica', 'mobility', '{}', 'Peso corporal', 'beginner', 'Rotação da parte de cima das costas em quatro apoios.', 'Fique em quatro apoios e leve uma mão atrás da cabeça.
Gire o tronco abrindo o cotovelo em direção ao teto.
Volte levando o cotovelo em direção ao braço de apoio e repita.', 'Acompanhe o cotovelo com o olhar.
Mantenha o quadril parado.', 'Girar o quadril junto.
Fazer o movimento com pressa.');
--> statement-breakpoint
UPDATE exercises e SET
  muscle_group = l.muscle_group::muscle_group,
  secondary_muscles = l.secondary::muscle_group[],
  equipment = l.equipment,
  difficulty = l.difficulty::exercise_difficulty,
  description = l.description,
  instructions = l.instructions,
  tips = l.tips,
  common_mistakes = l.common_mistakes
FROM _library l
WHERE e.workspace_id IS NULL AND e.archived_at IS NULL AND lower(e.name) = lower(l.name);
--> statement-breakpoint
INSERT INTO exercises (name, muscle_group, secondary_muscles, equipment, difficulty, description, instructions, tips, common_mistakes)
SELECT l.name, l.muscle_group::muscle_group, l.secondary::muscle_group[], l.equipment, l.difficulty::exercise_difficulty, l.description, l.instructions, l.tips, l.common_mistakes
FROM _library l
WHERE NOT EXISTS (SELECT 1 FROM exercises e WHERE e.workspace_id IS NULL AND e.archived_at IS NULL AND lower(e.name) = lower(l.name));
--> statement-breakpoint
DROP TABLE _library;
