import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  FlatList,
  SafeAreaView,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// =============================================================================
// SERVIÇO DE COMUNICAÇÃO HTTP
// =============================================================================
const HttpService = {
  urnaIpAddress: null,

  setUrnaIp: (ip) => {
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
      HttpService.urnaIpAddress = ip;
      console.log(`IP da Urna configurado para: ${HttpService.urnaIpAddress}`);
      return true;
    }
    console.error("Formato de IP inválido");
    return false;
  },

  sendCommand: async (command) => {
    if (!HttpService.urnaIpAddress) {
      Alert.alert('ERRO', 'O IP da Urna não foi configurado!');
      return false;
    }
    try {
      const url = `http://${HttpService.urnaIpAddress}/${command}`;
      console.log(`Enviando comando para: ${url}`);
      await fetch(url, { timeout: 3000 });
      return true;
    } catch (error) {
      console.error(`Erro ao enviar comando '${command}':`, error);
      Alert.alert('Erro de Comunicação', 'Não foi possível se conectar à urna. Verifique o IP e a conexão Wi-Fi.');
      return false;
    }
  },

  getStatus: async () => {
    if (!HttpService.urnaIpAddress) return null;
    try {
      const response = await fetch(`http://${HttpService.urnaIpAddress}/status`, { timeout: 2000 });
      if (!response.ok) return null;
      const data = await response.json();
      return data;
    } catch (error) {
      // Silencioso para não poluir o console
      return null;
    }
  },
};

// =============================================================================
// COMPONENTES DE UI
// =============================================================================
const colors = {
  primary: '#0057A8', secondary: '#009B3A', success: '#28a745',
  error: '#dc3545', warning: '#ffc107', light: '#f8f9fa',
  dark: '#343a40', white: '#ffffff', gray: '#6c757d', lightGray: '#e9ecef',
};

const Header = ({ title, onBack }) => (
  <View style={styles.header}>
    {onBack && (
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color={colors.white} />
      </TouchableOpacity>
    )}
    <Text style={styles.headerTitle}>{title}</Text>
  </View>
);

const Card = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;

const Button = ({ title, onPress, variant = 'primary', disabled, icon, style }) => (
  <TouchableOpacity
    style={[styles.button, styles[`button${variant.charAt(0).toUpperCase() + variant.slice(1)}`], disabled && styles.buttonDisabled, style]}
    onPress={onPress} disabled={disabled}
  >
    {icon && <Ionicons name={icon} size={20} color={disabled ? colors.gray : colors.white} style={styles.buttonIcon} />}
    <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>{title}</Text>
  </TouchableOpacity>
);

const Input = ({ label, value, onChangeText, placeholder, multiline, keyboardType }) => (
  <View style={styles.inputContainer}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline]}
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      multiline={multiline} keyboardType={keyboardType} placeholderTextColor={colors.gray}
    />
  </View>
);

const StatusIndicator = ({ status }) => {
    const isConnected = status === 'connected';
    const isConnecting = status === 'connecting';
    
    let color = colors.error;
    if (isConnected) color = colors.success;
    if (isConnecting) color = colors.warning;
    
    let text = 'Urna Desconectada';
    if (isConnected) text = 'Urna Conectada ✓';
    if (isConnecting) text = 'Conectando...';

    return (
        <View style={styles.statusContainer}>
          {isConnecting ? <ActivityIndicator size="small" color={color} style={{marginRight: 8}}/> : <View style={[styles.statusDot, { backgroundColor: color }]} /> }
          <Text style={styles.statusText}>{text}</Text>
        </View>
    );
};


// =============================================================================
// TELAS DA APLICAÇÃO
// =============================================================================

const IpConfigScreen = ({ onIpSet }) => {
  const [ipInput, setIpInput] = useState('');
  const handleSetIp = () => {
    if (HttpService.setUrnaIp(ipInput)) {
      onIpSet();
    } else {
      Alert.alert("Erro", "Por favor, insira um endereço de IP válido.");
    }
  };
  return (
    <SafeAreaView style={styles.container}>
      <Header title="Configurar Urna" />
      <ScrollView contentContainerStyle={styles.contentCenter}>
        <Card style={{width: '90%'}}>
          <Text style={styles.stepTitle}>Conectar à Urna</Text>
          <Text style={styles.stepDescription}>
            Ligue sua Urna, conecte-a ao Wi-Fi e digite o IP que aparece no monitor serial.
          </Text>
          <Input label="Endereço IP da Urna" value={ipInput} onChangeText={setIpInput} placeholder="Ex: 192.168.1.15" keyboardType="numeric" />
          <Button title="Salvar e Conectar" onPress={handleSetIp} disabled={!ipInput.trim()} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const HomeScreen = ({ onCreateElection, elections, onSelectElection }) => (
    <SafeAreaView style={styles.container}>
      <Header title="ApuraFácil" />
      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Minhas Eleições</Text>
        {elections.length === 0 ? (
          <Card><Text style={styles.emptyText}>Nenhuma eleição criada. Toque no + para começar.</Text></Card>
        ) : (
          elections.map((election) => (
            <TouchableOpacity key={election.id} onPress={() => onSelectElection(election)}>
              <Card style={styles.electionCard}>
                <View style={styles.electionHeader}>
                    <Text style={styles.electionName}>{election.name}</Text>
                    <View style={[styles.statusBadge, election.status === 'finished' ? styles.statusFinished : styles.statusActive]}>
                        <Text style={styles.statusBadgeText}>{election.status === 'finished' ? 'Encerrada' : 'Ativa'}</Text>
                    </View>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={onCreateElection}>
        <Ionicons name="add" size={24} color={colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );

const CreateElectionScreen = ({ onFinish, onBack }) => {
    // Hooks movidos para o topo para corrigir o erro "Rules of Hooks"
    const [step, setStep] = useState(1);
    const [electionData, setElectionData] = useState({ name: '', description: '', candidates: [], voters: [] });
    const [candidate, setCandidate] = useState({ name: '', number: '' });
    const [voterText, setVoterText] = useState('');

    const handleFinish = () => {
        if (electionData.voters.length === 0 || electionData.candidates.length === 0) {
            Alert.alert("Erro", "É necessário cadastrar pelo menos um candidato e um eleitor.");
            return;
        }
        onFinish(electionData);
    };

    if (step === 1) { // Detalhes
        return (
            <SafeAreaView style={styles.container}>
                <Header title="Nova Eleição (1/3)" onBack={onBack} />
                <ScrollView style={styles.content}>
                    <Card>
                        <Input label="Nome da Eleição *" value={electionData.name} onChangeText={(text) => setElectionData({...electionData, name: text})} placeholder="Ex: Grêmio Estudantil 2025" />
                        <Input label="Descrição (Opcional)" value={electionData.description} onChangeText={(text) => setElectionData({...electionData, description: text})} placeholder="Breve descrição" multiline />
                    </Card>
                </ScrollView>
                <View style={styles.bottomActions}><Button title="Próximo" onPress={() => setStep(2)} disabled={!electionData.name.trim()} icon="arrow-forward" /></View>
            </SafeAreaView>
        );
    }
    if (step === 2) { // Candidatos
        const addCandidate = () => {
            if (candidate.name.trim() && candidate.number.trim()) {
                setElectionData({...electionData, candidates: [...electionData.candidates, {...candidate, id: Date.now().toString()}] });
                setCandidate({ name: '', number: '' });
            }
        };
        return (
            <SafeAreaView style={styles.container}>
                <Header title="Candidatos (2/3)" onBack={() => setStep(1)} />
                <ScrollView style={styles.content}>
                    <Card>
                        <Input label="Nome do Candidato" value={candidate.name} onChangeText={(text) => setCandidate({...candidate, name: text})} placeholder="Nome completo" />
                        <Input label="Número" value={candidate.number} onChangeText={(text) => setCandidate({...candidate, number: text})} placeholder="00" keyboardType="numeric" maxLength={2} />
                        <Button title="Adicionar Candidato" onPress={addCandidate} variant="secondary" disabled={!candidate.name.trim() || !candidate.number.trim()} />
                    </Card>
                    <FlatList data={electionData.candidates} keyExtractor={item => item.id} renderItem={({item}) => <Card><Text>{item.name} - {item.number}</Text></Card>} />
                </ScrollView>
                <View style={styles.bottomActions}><Button title="Próximo" onPress={() => setStep(3)} disabled={electionData.candidates.length === 0} icon="arrow-forward" /></View>
            </SafeAreaView>
        );
    }
    if (step === 3) { // Eleitores
        const addVoters = () => {
            const names = voterText.split('\n').map(name => name.trim()).filter(Boolean);
            const newVoters = names.map(name => ({ id: Date.now().toString() + name, name }));
            setElectionData({...electionData, voters: [...electionData.voters, ...newVoters]});
            setVoterText('');
        };
        return (
            <SafeAreaView style={styles.container}>
                <Header title="Eleitores (3/3)" onBack={() => setStep(2)} />
                <ScrollView style={styles.content}>
                    <Card>
                        <Text style={styles.stepDescription}>Digite um nome por linha ou cole uma lista de nomes.</Text>
                        <TextInput style={[styles.input, styles.voterTextArea]} value={voterText} onChangeText={setVoterText} multiline textAlignVertical="top" />
                        <Button title="Adicionar Eleitores" onPress={addVoters} variant="secondary" disabled={!voterText.trim()} />
                    </Card>
                    <Card>
                        <Text>{electionData.voters.length} eleitores cadastrados</Text>
                        <FlatList data={electionData.voters} keyExtractor={item => item.id} renderItem={({item}) => <Text>{item.name}</Text>} />
                    </Card>
                </ScrollView>
                <View style={styles.bottomActions}><Button title="Finalizar e Iniciar Eleição" onPress={handleFinish} icon="play" /></View>
            </SafeAreaView>
        );
    }
};

const VotingPanel = ({ election, onEnableVoter, onEndElection, liveStatus, onBack, connectionStatus }) => {
    const totalVoters = election.voters?.length || 0;
    const votedCount = (liveStatus?.candA_votes || 0) + (liveStatus?.candB_votes || 0) + (liveStatus?.blank_votes || 0) + (liveStatus?.null_votes || 0);
  
    return (
      <SafeAreaView style={styles.container}>
        <Header title={election.name} onBack={onBack}/>
        <View style={styles.content}>
          <StatusIndicator status={connectionStatus} />
          <Card style={styles.votingStats}>
            <Text style={styles.statsTitle}>Status da Votação</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}><Text style={styles.statNumber}>{votedCount}</Text><Text style={styles.statLabel}>Votos Computados</Text></View>
              <View style={styles.statItem}><Text style={styles.statNumber}>{totalVoters - votedCount}</Text><Text style={styles.statLabel}>Eleitores Restantes</Text></View>
            </View>
          </Card>
          <View style={styles.mainAction}>
            <Button title="HABILITAR PRÓXIMO ELEITOR" onPress={onEnableVoter} icon="person-add" style={styles.scanButton} disabled={connectionStatus !== 'connected'} />
          </View>
        </View>
        <View style={styles.bottomActions}>
          <Button title="Encerrar Votação" onPress={onEndElection} variant="error" icon="stop" disabled={connectionStatus !== 'connected'}/>
        </View>
      </SafeAreaView>
    );
};

const ResultsScreen = ({ election, liveStatus, onBack }) => {
    const candidatesData = election.candidates || [];
    const results = [
        { ...(candidatesData[0] || {name: 'Cand. A', number: '12'}), votes: liveStatus?.candA_votes || 0 },
        { ...(candidatesData[1] || {name: 'Cand. B', number: '13'}), votes: liveStatus?.candB_votes || 0 }
    ].sort((a,b) => b.votes - a.votes);
    const totalVotes = results.reduce((sum, c) => sum + c.votes, 0) + (liveStatus?.blank_votes || 0) + (liveStatus?.null_votes || 0);

    return (
        <SafeAreaView style={styles.container}>
            <Header title="Resultados Finais" onBack={onBack} />
            <ScrollView style={styles.content}>
                <Card>
                    <Text style={styles.resultsTitle}>{election.name}</Text>
                    <Text style={styles.totalVotes}>Total de votos: {totalVotes}</Text>
                </Card>
                {results.map((candidate, index) => (
                    <Card key={candidate.id}>
                        <Text style={styles.candidateResultName}>{index === 0 && '🏆 '}{candidate.name} ({candidate.number})</Text>
                        <Text style={styles.candidateResultVotes}>{candidate.votes} votos</Text>
                    </Card>
                ))}
                 <Card>
                    <Text>Brancos: {liveStatus?.blank_votes || 0}</Text>
                    <Text>Nulos: {liveStatus?.null_votes || 0}</Text>
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
};

// =============================================================================
// COMPONENTE PRINCIPAL DO APP
// =============================================================================
const ApuraFacilApp = () => {
  const [currentScreen, setCurrentScreen] = useState('ip_config');
  const [elections, setElections] = useState([]);
  const [currentElection, setCurrentElection] = useState(null);
  const [liveUrnaStatus, setLiveUrnaStatus] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const pollingInterval = useRef(null);

  // --- LÓGICA DE CONEXÃO E POLLING CORRIGIDA ---
  useEffect(() => {
    const startConnectionAndPolling = async () => {
      if (pollingInterval.current) clearInterval(pollingInterval.current); // Limpa polling anterior

      setConnectionStatus('connecting');

      // Tenta enviar o comando inicial
      const startSuccess = await HttpService.sendCommand('start');

      if (!startSuccess) {
        setConnectionStatus('disconnected');
        return; // Aborta se o comando inicial falhar
      }

      // Se o comando inicial funcionou, começa o polling
      pollingInterval.current = setInterval(async () => {
        const status = await HttpService.getStatus();
        if (status) {
          setLiveUrnaStatus(status);
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('disconnected');
        }
      }, 3000);
    };

    if ((currentScreen === 'voting' || currentScreen === 'results') && HttpService.urnaIpAddress) {
        startConnectionAndPolling();
    }
    
    // Função de limpeza
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, [currentScreen]); // Roda sempre que a tela mudar

  const handleCreateElection = (electionData) => {
    const newElection = {
        ...electionData,
        id: Date.now().toString(),
        status: 'active'
    };
    setElections(prev => [...prev, newElection]);
    setCurrentElection(newElection);
    setCurrentScreen('voting'); // Apenas navega, o useEffect cuidará da conexão
  };
  
  const handleSelectElection = (election) => {
    setCurrentElection(election);
    if (election.status === 'active') {
        setCurrentScreen('voting'); // Apenas navega
    } else {
        setCurrentScreen('results'); // Navega para os resultados
    }
  };

  const handleEnableVoter = () => {
    HttpService.sendCommand('enable');
  };

  const handleEndElection = () => {
    Alert.alert('Confirmar Encerramento', 'Tem certeza?', [
      { text: 'Cancelar' },
      { text: 'Encerrar', style: 'destructive', onPress: async () => {
          const success = await HttpService.sendCommand('end');
          if (success) {
            setTimeout(async () => {
                const finalStatus = await HttpService.getStatus();
                if (finalStatus) setLiveUrnaStatus(finalStatus);
                setElections(prev => prev.map(e => e.id === currentElection.id ? {...e, status: 'finished'} : e));
                setCurrentScreen('results');
            }, 500);
          }
      }},
    ]);
  };

  const renderScreen = () => {
    if (currentScreen === 'ip_config') {
      return <IpConfigScreen onIpSet={() => setCurrentScreen('home')} />;
    }
    
    switch (currentScreen) {
      case 'home':
        return <HomeScreen elections={elections} onCreateElection={() => setCurrentScreen('createElection')} onSelectElection={handleSelectElection}/>;
      case 'createElection':
        return <CreateElectionScreen onFinish={handleCreateElection} onBack={() => setCurrentScreen('home')} />
      case 'voting':
        return <VotingPanel election={currentElection} onEnableVoter={handleEnableVoter} onEndElection={handleEndElection} liveStatus={liveUrnaStatus} connectionStatus={'connected'} onBack={() => setCurrentScreen('home')} />; // Hardcoded, alterar posteriormente.
      case 'results':
        return <ResultsScreen election={currentElection} liveStatus={liveUrnaStatus} onBack={() => setCurrentScreen('home')} />
      default:
        return <HomeScreen elections={elections} onCreateElection={() => setCurrentScreen('createElection')} onSelectElection={handleSelectElection}/>;
    }
  };

  return (
    <View style={styles.app}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      {renderScreen()}
    </View>
  );
};

// =============================================================================
// FOLHA DE ESTILOS
// =============================================================================
const styles = StyleSheet.create({
    app: { flex: 1, backgroundColor: colors.light, },
    container: { flex: 1, backgroundColor: colors.light, },
    content: { flex: 1, padding: 16, },
    contentCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
    header: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: StatusBar.currentHeight || 16, paddingBottom: 12, },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: 'bold', color: colors.white, textAlign: 'center' },
    backButton: { position: 'absolute', left: 16, top: StatusBar.currentHeight || 16, bottom: 0, justifyContent: 'center' },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.dark, marginBottom: 16, },
    card: { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, },
    emptyText: { fontSize: 16, color: colors.gray, textAlign: 'center', },
    electionCard: { marginBottom: 12, },
    electionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
    electionName: { fontSize: 18, fontWeight: 'bold', color: colors.dark, },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, },
    statusActive: { backgroundColor: colors.success },
    statusFinished: { backgroundColor: colors.gray },
    statusBadgeText: { color: colors.white, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, },
    stepTitle: { fontSize: 20, fontWeight: 'bold', color: colors.dark, marginBottom: 8, },
    stepDescription: { fontSize: 14, color: colors.gray, marginBottom: 24, },
    inputContainer: { marginBottom: 16, },
    inputLabel: { fontSize: 14, fontWeight: '600', color: colors.dark, marginBottom: 8, },
    input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.lightGray, borderRadius: 8, padding: 12, fontSize: 16, color: colors.dark, },
    voterTextArea: { minHeight: 120, textAlignVertical: 'top', },
    button: { flexDirection: 'row', backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 48, },
    buttonPrimary: { backgroundColor: colors.primary, },
    buttonSecondary: { backgroundColor: colors.secondary, },
    buttonError: { backgroundColor: colors.error, },
    buttonDisabled: { backgroundColor: colors.lightGray, },
    buttonText: { color: colors.white, fontSize: 16, fontWeight: '600', },
    buttonTextDisabled: { color: colors.gray, },
    buttonIcon: { marginRight: 8, },
    bottomActions: { padding: 16, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.lightGray, },
    statusContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, padding: 12, borderRadius: 8, marginBottom: 16, elevation: 1, },
    statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8, },
    statusText: { fontSize: 14, fontWeight: '600', color: colors.dark, },
    votingStats: { marginBottom: 24, },
    statsTitle: { fontSize: 18, fontWeight: 'bold', color: colors.dark, marginBottom: 16, textAlign: 'center', },
    statsRow: { flexDirection: 'row', justifyContent: 'space-around', },
    statItem: { alignItems: 'center', flex: 1, },
    statNumber: { fontSize: 32, fontWeight: 'bold', color: colors.primary, },
    statLabel: { fontSize: 14, color: colors.gray, marginTop: 4, },
    mainAction: { flex: 1, justifyContent: 'center', alignItems: 'center', },
    scanButton: { paddingVertical: 20, paddingHorizontal: 32, minHeight: 80, },
    resultsTitle: { fontSize: 24, fontWeight: 'bold', color: colors.dark, textAlign: 'center', marginBottom: 8, },
    totalVotes: { fontSize: 14, color: colors.gray, textAlign: 'center', },
    candidateResultName: { fontSize: 16, fontWeight: '600', color: colors.dark },
    candidateResultVotes: { fontSize: 14, color: colors.gray, marginTop: 4 },
});

export default ApuraFacilApp;

