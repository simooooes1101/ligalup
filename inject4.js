const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// 1. Wipe DB constant
const dbStart = code.indexOf('const DB = {');
const dbEnd = code.indexOf('    };\n', dbStart) + 7;
const newDb = `const DB = {
        usuarios: [], eventos: [], tarefas_logistica: [], modalidades: [],
        atletas: [], produtos: [], produto_variantes: [], calendario_editorial: [],
        cronograma_postagens: [], escalacoes: [], participantes_evento: [],
        lancamentos_financeiros: [], parceiros_patrocinadores: [], documentos_contratos: [],
        logs_notificacoes: [], fornecedores: [], pedidos_compra: [], chat_conversations: [],
        chat_participants: [], chat_messages: []
    };\n`;
code = code.substring(0, dbStart) + newDb + code.substring(dbEnd);

// 2. Wipe MOCK_CONVERSATIONS and add buildChatFromDB
const mockStart = code.indexOf('const MOCK_CONVERSATIONS = [');
const mockEndStr = '];\n\n// ── 2. ESTADO INTERNO ────────────────────────────────────────────';
const mockEnd = code.indexOf(mockEndStr) + 3;

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
code = code.substring(0, mockStart) + buildChatFn + code.substring(mockEnd);

// 3. Update initChatModule
const initChatRegex = /function initChatModule\(\) \{\s*chatState\.conversations = MOCK_CONVERSATIONS;\s*chatState\.filteredConversations = \[\.\.\.MOCK_CONVERSATIONS\];/;
const newInitChat = `function initChatModule() {
  chatState.conversations = buildChatFromDB();
  chatState.filteredConversations = [...chatState.conversations];
  
  if (!window.chatSubscribed) {
      window.chatSubscribed = true;
      supabase.channel('public:chat_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
            const newMsg = payload.new;
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
  }`;
code = code.replace(initChatRegex, newInitChat);

// 4. Replace sendMockMessage logic
const sendMockStart = code.indexOf('function sendMockMessage() {');
const sendMockEnd = code.indexOf('// ================================================================', sendMockStart);
const newSendMock = `function sendMockMessage() {
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

  DB.chat_messages.push(newMsg);
  
  supabase.from('chat_messages').insert(newMsg).then(({error}) => {
      if(error) console.error('Erro ao enviar mensagem:', error);
  });

  chatState.conversations = buildChatFromDB();
  chatState.filteredConversations = [...chatState.conversations];

  inputEl.value = '';
  openConversation(chatState.selectedConversationId);
}
`;
code = code.substring(0, sendMockStart) + newSendMock + code.substring(sendMockEnd);

fs.writeFileSync('app.js', code);
console.log('App.js modificado com sucesso!');
