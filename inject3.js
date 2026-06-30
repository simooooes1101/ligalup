const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// 1. Clear DB mock data
code = code.replace(/const DB = \{[\s\S]*?\n    \};\n/m, `const DB = {
        usuarios: [],
        eventos: [],
        tarefas_logistica: [],
        modalidades: [],
        atletas: [],
        produtos: [],
        produto_variantes: [],
        calendario_editorial: [],
        cronograma_postagens: [],
        escalacoes: [],
        participantes_evento: [],
        lancamentos_financeiros: [],
        parceiros_patrocinadores: [],
        documentos_contratos: [],
        logs_notificacoes: [],
        fornecedores: [],
        pedidos_compra: [],
        chat_conversations: [
            { id: 'conv-1', name: 'Geral LUP', type: 'Grupo', created_at: new Date().toISOString() }
        ],
        chat_participants: [],
        chat_messages: []
    };\n`);

// 2. Add buildChatFromDB function
const buildChatFn = `
function buildChatFromDB() {
    if (!DB.chat_conversations) return [];
    return DB.chat_conversations.map(conv => {
        const msgs = (DB.chat_messages || []).filter(m => m.conversation_id === conv.id)
            .sort((a,b) => new Date(a.sent_at) - new Date(b.sent_at))
            .map(m => {
                const isMe = window.currentUser && m.sender_id === window.currentUser.id;
                const senderUser = DB.usuarios.find(u => u.id === m.sender_id);
                return {
                    id: m.id,
                    senderId: isMe ? 'me' : m.sender_id,
                    senderName: isMe ? 'Eu' : (senderUser ? senderUser.nome : 'Usuário'),
                    text: m.body,
                    time: new Date(m.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                };
            });
        const lastMsg = msgs[msgs.length - 1];
        return {
            id: conv.id,
            name: conv.name,
            role: conv.type,
            avatar: null,
            lastMessage: lastMsg ? lastMsg.text : 'Sem mensagens',
            timestamp: lastMsg ? lastMsg.time : '',
            unread: 0,
            messages: msgs
        };
    });
}
`;

code = code.replace(/const MOCK_CONVERSATIONS = \[[\s\S]*?\];\n/m, buildChatFn + '\n');

// 3. Update initChatModule
code = code.replace(/function initChatModule\(\) \{[\s\S]*?chatState\.conversations = MOCK_CONVERSATIONS;\n  chatState\.filteredConversations = \[\.\.\.MOCK_CONVERSATIONS\];/m, 
`function initChatModule() {
  chatState.conversations = buildChatFromDB();
  chatState.filteredConversations = [...chatState.conversations];
  
  // Realtime subscription setup
  if (!window.chatSubscribed) {
      window.chatSubscribed = true;
      supabase.channel('public:chat_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
            const newMsg = payload.new;
            // Verifica duplicidade local
            if (DB.chat_messages.find(m => m.id === newMsg.id)) return;
            
            DB.chat_messages.push(newMsg);
            chatState.conversations = buildChatFromDB();
            chatState.filteredConversations = [...chatState.conversations];
            
            if (chatState.selectedConversationId) {
               openConversation(chatState.selectedConversationId);
            } else {
               renderConversationList(chatState.filteredConversations);
            }
        })
        .subscribe();
  }`);

// 4. Update sendMockMessage
const sendMockMessageRegex = /function sendMockMessage\(\) \{[\s\S]*?openConversation\(chatState\.selectedConversationId\);\n\}/m;
const newSendMockMessage = `function sendMockMessage() {
  const inputEl = document.getElementById('chat-input-field');
  const text    = inputEl?.value?.trim();

  if (!text || !chatState.selectedConversationId || !window.currentUser) return;

  const newMsg = {
    id: 'm_' + Date.now(),
    conversation_id: chatState.selectedConversationId,
    sender_id: window.currentUser.id,
    body: text,
    sent_at: new Date().toISOString()
  };

  // Atualiza local imediatamente (Optimistic UI)
  DB.chat_messages.push(newMsg);
  
  // Sincroniza com Supabase
  supabase.from('chat_messages').insert(newMsg).then(({error}) => {
      if(error) console.error('Erro ao enviar mensagem:', error);
  });

  // Atualiza o estado da UI
  chatState.conversations = buildChatFromDB();
  chatState.filteredConversations = [...chatState.conversations];

  inputEl.value = '';
  openConversation(chatState.selectedConversationId);
}`;

code = code.replace(sendMockMessageRegex, newSendMockMessage);

fs.writeFileSync('app.js', code);
console.log('Injecoes do chat e limpeza de dados concluidas!');
