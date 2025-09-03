let urnaIpAddress = null;

// Função para o app configurar o IP da urna
const setUrnaIp = (ip) => {
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
      urnaIpAddress = ip;
      console.log(`IP da Urna configurado para: ${urnaIpAddress}`);
      return true;
    }
    console.error("Formato de IP inválido");
    return false;
};

// Função para enviar um comando simples para a urna
const sendCommand = async (command) => { // command será 'start', 'enable', ou 'end'
  if (!urnaIpAddress) {
    alert('ERRO: O IP da Urna nao foi configurado!');
    return;
  }
  try {
    const url = `http://${urnaIpAddress}/${command}`;
    console.log(`Enviando comando para: ${url}`);
    // O fetch envia a requisição.
    await fetch(url);
  } catch (error) {
    console.error(`Erro ao enviar comando '${command}':`, error);
    alert('Erro de comunicacao com a urna. Verifique o IP e a conexao Wi-Fi.');
  }
};

// Função para buscar o status da urna
const getStatus = async () => {
    if (!urnaIpAddress) return null;
    try {
        const response = await fetch(`http://${urnaIpAddress}/status`);
        const data = await response.json(); // Converte a resposta JSON em um objeto
        return data;
    } catch (error) {
        console.log("Falha ao buscar status:", error); // Silencioso para não poluir
        return null;
    }
};


export { setUrnaIp, sendCommand, getStatus };