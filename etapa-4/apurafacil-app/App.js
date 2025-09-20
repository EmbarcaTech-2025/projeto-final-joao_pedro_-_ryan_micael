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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// =============================================================================
// SERVIÇO DE COMUNICAÇÃO HTTP
// =============================================================================
const HttpService = {
  urnaIpAddress: '192.168.4.1',

  sendConfiguration: async (electionData) => {
    if (!HttpService.urnaIpAddress) return false;
    try {
      const url = `http://${HttpService.urnaIpAddress}/configure`;
      const candidatesPayload = electionData.candidates.map(c => ({ 
        name: c.name, 
        number: c.number 
      }));
      
      console.log('Enviando configuração:', candidatesPayload);
      
      const response = await Promise.race([
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(candidatesPayload)
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      ]);
      
      console.log("Configuração enviada, status:", response.status);
      return response.ok;
    } catch (error) {
      console.error('Erro ao enviar configuração:', error);
      return false;
    }
  },

  encerrarVotacao: async (finalResults) => {
    // 1. Lógica para encontrar o ganhador
    let winnerName = "Sem resultados"; // Mensagem padrão

    // Verifica se há candidatos nos resultados
    if (finalResults && finalResults.candidates && finalResults.candidates.length > 0) {
      
      // Encontra o número máximo de votos entre todos os candidatos
      const maxVotes = Math.max(...finalResults.candidates.map(c => c.votes));

      // Filtra para encontrar todos os candidatos que têm esse número máximo de votos
      const winners = finalResults.candidates.filter(c => c.votes === maxVotes);

      // Define o nome do ganhador baseado nas condições
      if (maxVotes === 0) {
        winnerName = "Nenhum voto computado"; // Se ninguém recebeu votos
      } else if (winners.length === 1) {
        winnerName = winners[0].name; // Se houver apenas um ganhador
      } else {
        winnerName = "Empate técnico"; // Se mais de um candidato tiver o máximo de votos
      }
    }

    try {
      const baseUrl = "http://192.168.4.16:8080";

      // 2. Monta o payload no formato exato que você pediu
      //    (Corrigido de 'command =' para 'command:')
      const payload = {
        command: "end",
        candidato: winnerName, 
      };

      console.log("Enviando resultado final (ganhador) para o servidor:", JSON.stringify(payload, null, 2));

      // 3. O resto da função continua igual, enviando o novo payload
      const response = await fetch(`${baseUrl}/comando`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("Resultados finais enviados, status:", response.status);
      return response.ok;
    } catch (error) {
      console.error("Erro ao enviar resultados finais para o servidor:", error);
      return false;
    }
  },

  iniciarVotacao: async (electionData) => {
    try {
      const baseUrl = "http://192.168.4.16:8080";

      // Monta o payload com command e candidatos juntos
      const payload = {
        command: "start",
        candidates: electionData.candidates, // espera { candidates: [...] }
      };

      console.log("Start sendo enviado: ", payload);

      // Envia tudo de uma vez para o Flask
      await fetch(`${baseUrl}/comando`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("Votação iniciada e configuração enviada com sucesso!");
    } catch (error) {
      console.error("Erro ao iniciar votação:", error);
    }
  },

  iniciarVotacao2: async (electionData) => {
    try {
      const baseUrl = "http://192.168.4.16:8080";

      // Monta o payload com command e candidatos juntos
      const payload = {
        command: "votar",
        candidates: electionData.candidates, // espera { candidates: [...] }
      };

      console.log("Payload sendo enviado: ", payload);

      // Envia tudo de uma vez para o Flask
      await fetch(`${baseUrl}/comando`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("Votação iniciada e configuração enviada com sucesso!");
    } catch (error) {
      console.error("Erro ao iniciar votação:", error);
    }
  },

  habilitarMesario: async () => {
    try {
      const baseUrl = "http://192.168.4.16:8080";

      // Monta o payload com command e candidatos juntos
      const payload = {
        command: "votar",
      };

      console.log("Payload votar sendo enviado: ", payload);

      // Envia tudo de uma vez para o Flask
      await fetch(`${baseUrl}/comando`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("Urna habilitada com sucesso!");
    } catch (error) {
      console.error("Erro ao habilitar urna:", error);
    }
  },

  sendCommand: async (command) => {
    if (!HttpService.urnaIpAddress) return false;
    try {
      const url = `http://${HttpService.urnaIpAddress}/${command}`;
      console.log(`Enviando comando: ${command}`);
      
      const response = await Promise.race([
        fetch(url, { method: 'GET' }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      ]);
      
      console.log(`Comando ${command} enviado, status:`, response.status);
      return response.ok;
    } catch (error) {
      console.error(`Erro ao enviar comando '${command}':`, error);
      return false;
    }
  },

  getStatus: async () => {
    if (!HttpService.urnaIpAddress) return null;
    try {
      const response = await Promise.race([
        fetch(`http://${HttpService.urnaIpAddress}/status`, { 
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 3000)
        )
      ]);
      
      if (!response.ok) {
        console.log(`Status response not ok: ${response.status}`);
        return null;
      }
      
      const textData = await response.text();
      const data = JSON.parse(textData);
      return data;
    } catch (error) {
      // Silencioso para não poluir console
      return null;
    }
  },
};

// =============================================================================
// CONFIGURAÇÕES DE CORES E ESTILOS
// =============================================================================
const colors = {
  primary: '#0057A8',
  secondary: '#009B3A', 
  success: '#28a745',
  error: '#dc3545',
  warning: '#ffc107',
  light: '#f8f9fa',
  dark: '#343a40',
  white: '#ffffff',
  gray: '#6c757d',
  lightGray: '#e9ecef',
};

// =============================================================================
// COMPONENTES DE UI
// =============================================================================
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

const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const Button = ({ title, onPress, variant = 'primary', disabled, icon, style }) => (
  <TouchableOpacity
    style={[
      styles.button, 
      styles[`button${variant.charAt(0).toUpperCase() + variant.slice(1)}`], 
      disabled && styles.buttonDisabled, 
      style
    ]}
    onPress={onPress} 
    disabled={disabled}
  >
    {icon && (
      <Ionicons 
        name={icon} 
        size={20} 
        color={disabled ? colors.gray : colors.white} 
        style={styles.buttonIcon} 
      />
    )}
    <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
      {title}
    </Text>
  </TouchableOpacity>
);

const Input = ({ label, value, onChangeText, placeholder, multiline, keyboardType }) => (
  <View style={styles.inputContainer}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      multiline={multiline}
      keyboardType={keyboardType}
      placeholderTextColor={colors.gray}
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
      {isConnecting ? (
        <ActivityIndicator size="small" color={color} style={{marginRight: 8}}/>
      ) : (
        <View style={[styles.statusDot, { backgroundColor: color }]} />
      )}
      <Text style={styles.statusText}>{text}</Text>
    </View>
  );
};

// =============================================================================
// TELAS DA APLICAÇÃO
// =============================================================================
const HomeScreen = ({ onCreateElection, elections, onSelectElection }) => (
  <SafeAreaView style={styles.container}>
    <Header title="ApuraFácil" />
    <ScrollView style={styles.content}>
      <Text style={styles.sectionTitle}>Minhas Eleições</Text>
      {elections.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>
            Nenhuma eleição criada. Toque no + para começar.
          </Text>
        </Card>
      ) : (
        elections.map((election) => (
          <TouchableOpacity key={election.id} onPress={() => onSelectElection(election)}>
            <Card style={styles.electionCard}>
              <View style={styles.electionHeader}>
                <Text style={styles.electionName}>{election.name}</Text>
                <View style={[
                  styles.statusBadge, 
                  election.status === 'finished' ? styles.statusFinished : styles.statusActive
                ]}>
                  <Text style={styles.statusBadgeText}>
                    {election.status === 'finished' ? 'Encerrada' : 'Ativa'}
                  </Text>
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
  const [step, setStep] = useState(1);
  const [electionData, setElectionData] = useState({ 
    name: '', 
    description: '', 
    candidates: [], 
    voters: [] 
  });
  const [candidate, setCandidate] = useState({ name: '', number: '' });
  const [voterText, setVoterText] = useState('');

  const handleFinish = () => {
    if (electionData.voters.length === 0 || electionData.candidates.length === 0) {
      Alert.alert("Erro", "É necessário cadastrar pelo menos um candidato e um eleitor.");
      return;
    }
    onFinish(electionData);
  };

  if (step === 1) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Nova Eleição (1/3)" onBack={onBack} />
        <ScrollView style={styles.content}>
          <Card>
            <Input 
              label="Nome da Eleição *" 
              value={electionData.name} 
              onChangeText={(text) => setElectionData({...electionData, name: text})} 
              placeholder="Ex: Grêmio Estudantil 2025" 
            />
            <Input 
              label="Descrição (Opcional)" 
              value={electionData.description} 
              onChangeText={(text) => setElectionData({...electionData, description: text})} 
              placeholder="Breve descrição" 
              multiline 
            />
          </Card>
        </ScrollView>
        <View style={styles.bottomActions}>
          <Button 
            title="Próximo" 
            onPress={() => setStep(2)} 
            disabled={!electionData.name.trim()} 
            icon="arrow-forward" 
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 2) {
    const addCandidate = () => {
      if (candidate.name.trim() && candidate.number.trim()) {
        const existingNumbers = electionData.candidates.map(c => c.number);
        if (existingNumbers.includes(candidate.number)) {
          Alert.alert("Erro", "Já existe um candidato com este número!");
          return;
        }
        
        setElectionData({
          ...electionData, 
          candidates: [...electionData.candidates, {...candidate, id: Date.now().toString()}] 
        });
        setCandidate({ name: '', number: '' });
      }
    };

    return (
      <SafeAreaView style={styles.container}>
        <Header title="Candidatos (2/3)" onBack={() => setStep(1)} />
        <ScrollView style={styles.content}>
          <Card>
            <Input 
              label="Nome do Candidato" 
              value={candidate.name} 
              onChangeText={(text) => setCandidate({...candidate, name: text})} 
              placeholder="Nome completo" 
            />
            <Input 
              label="Número" 
              value={candidate.number} 
              onChangeText={(text) => setCandidate({...candidate, number: text})} 
              placeholder="00" 
              keyboardType="numeric" 
            />
            <Button 
              title="Adicionar Candidato" 
              onPress={addCandidate} 
              variant="secondary" 
              disabled={!candidate.name.trim() || !candidate.number.trim()} 
            />
          </Card>
          
          {electionData.candidates.length > 0 && (
            <Card>
              <Text style={styles.stepTitle}>Candidatos Cadastrados:</Text>
              {electionData.candidates.map(item => (
                <Text key={item.id} style={styles.candidateItem}>
                  {item.name} - {item.number}
                </Text>
              ))}
            </Card>
          )}
        </ScrollView>
        <View style={styles.bottomActions}>
          <Button 
            title="Próximo" 
            onPress={() => setStep(3)} 
            disabled={electionData.candidates.length === 0} 
            icon="arrow-forward" 
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 3) {
    const addVoters = () => {
      const names = voterText.split('\n')
        .map(name => name.trim())
        .filter(Boolean);
      
      const newVoters = names.map(name => ({ 
        id: Date.now().toString() + Math.random(), 
        name 
      }));
      
      setElectionData({
        ...electionData, 
        voters: [...electionData.voters, ...newVoters]
      });
      setVoterText('');
    };

    return (
      <SafeAreaView style={styles.container}>
        <Header title="Eleitores (3/3)" onBack={() => setStep(2)} />
        <ScrollView style={styles.content}>
          <Card>
            <Text style={styles.stepDescription}>
              Digite um nome por linha ou cole uma lista de nomes.
            </Text>
            <TextInput 
              style={[styles.input, styles.voterTextArea]} 
              value={voterText} 
              onChangeText={setVoterText} 
              multiline 
              textAlignVertical="top"
              placeholder="João Silva&#10;Maria Santos&#10;Pedro Costa"
            />
            <Button 
              title="Adicionar Eleitores" 
              onPress={addVoters} 
              variant="secondary" 
              disabled={!voterText.trim()} 
            />
          </Card>
          
          <Card>
            <Text style={styles.stepTitle}>
              {electionData.voters.length} eleitores cadastrados
            </Text>
            {electionData.voters.slice(0, 5).map(voter => (
              <Text key={voter.id} style={styles.voterItem}>{voter.name}</Text>
            ))}
            {electionData.voters.length > 5 && (
              <Text style={styles.moreItems}>
                ... e mais {electionData.voters.length - 5} eleitores
              </Text>
            )}
          </Card>
        </ScrollView>
        <View style={styles.bottomActions}>
          <Button 
            title="Finalizar e Iniciar Eleição" 
            onPress={handleFinish} 
            icon="play" 
            disabled={electionData.voters.length === 0}
          />
        </View>
      </SafeAreaView>
    );
  }
};

const VotingPanel = ({ election, onEnableVoter, onEndElection, liveStatus, onBack, connectionStatus }) => {
  const totalVoters = election.voters?.length || 0;
  
  const votedCount = liveStatus ? 
    (liveStatus.candidates || []).reduce((sum, c) => sum + (parseInt(c.votes) || 0), 0) + 
    (parseInt(liveStatus.blank_votes) || 0) + 
    (parseInt(liveStatus.null_votes) || 0) 
    : 0;
  
  const remainingVoters = Math.max(0, totalVoters - votedCount);
  const allVoted = remainingVoters === 0 && totalVoters > 0;

  return (
    <SafeAreaView style={styles.container}>
      <Header title={election.name} onBack={onBack}/>
      <View style={styles.content}>
        <StatusIndicator status={connectionStatus} />
        
        <Card style={styles.votingStats}>
          <Text style={styles.statsTitle}>Status da Votação</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{votedCount}</Text>
              <Text style={styles.statLabel}>Votos Computados</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{remainingVoters}</Text>
              <Text style={styles.statLabel}>Eleitores Restantes</Text>
            </View>
          </View>
          
          {totalVoters > 0 && (
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>
                Progresso: {votedCount}/{totalVoters} ({Math.round((votedCount/totalVoters) * 100)}%)
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, {width: `${(votedCount/totalVoters) * 100}%`}]} />
              </View>
            </View>
          )}
        </Card>
        
        <View style={styles.mainAction}>
          <Button 
            title={allVoted ? "TODOS VOTARAM" : "HABILITAR PRÓXIMO ELEITOR"} 
            onPress={onEnableVoter} 
            icon="person-add" 
            style={styles.scanButton} 
            disabled={connectionStatus !== 'connected' || allVoted} 
          />
          
          {allVoted && (
            <Text style={styles.allVotedText}>
              Todos os eleitores já votaram! Você pode encerrar a votação.
            </Text>
          )}
        </View>
      </View>
      
      <View style={styles.bottomActions}>
        <Button 
          title="Encerrar Votação" 
          onPress={onEndElection} 
          variant="error" 
          icon="stop" 
          disabled={connectionStatus !== 'connected'}
        />
      </View>
    </SafeAreaView>
  );
};

const ResultsScreen = ({ election, liveStatus, onBack }) => {
  const candidatesFromStatus = liveStatus?.candidates || election.candidates || [];
  const results = [...candidatesFromStatus].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  const totalVotes = results.reduce((sum, c) => sum + (c.votes || 0), 0) + 
    (liveStatus?.blank_votes || 0) + 
    (liveStatus?.null_votes || 0);

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Resultados Finais" onBack={onBack} />
      <ScrollView style={styles.content}>
        <Card>
          <Text style={styles.resultsTitle}>{election.name}</Text>
          <Text style={styles.totalVotes}>Total de votos: {totalVotes}</Text>
        </Card>
        
        {results.map((candidate, index) => (
          <Card key={candidate.id || candidate.number}>
            <Text style={styles.candidateResultName}>
              {index === 0 && totalVotes > 0 && '🏆 '}
              {candidate.name} ({candidate.number})
            </Text>
            <Text style={styles.candidateResultVotes}>
              {candidate.votes || 0} votos
            </Text>
          </Card>
        ))}
        
        <Card>
          <Text style={styles.otherVotesTitle}>Outros Votos:</Text>
          <Text style={styles.otherVotes}>Brancos: {liveStatus?.blank_votes || 0}</Text>
          <Text style={styles.otherVotes}>Nulos: {liveStatus?.null_votes || 0}</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

// =============================================================================
// COMPONENTE PRINCIPAL DO APP
// =============================================================================
const ApuraFacilApp = () => {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [elections, setElections] = useState([]);
  const [currentElection, setCurrentElection] = useState(null);
  const [liveUrnaStatus, setLiveUrnaStatus] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isLoading, setIsLoading] = useState(false);
  
  const pollingInterval = useRef(null);

  // Cleanup na desmontagem
  useEffect(() => {
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, []);

  // Polling quando na tela de votação ou resultados
  useEffect(() => {
    const startPolling = async () => {
      console.log('Iniciando polling...');
      
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }

      setConnectionStatus('connecting');

      const initialStatus = await HttpService.getStatus();
      
      if (initialStatus === null) {
        console.log('Falha na conexão inicial');
        setConnectionStatus('disconnected');
        return;
      }

      console.log('Conexão inicial bem-sucedida');
      setLiveUrnaStatus(initialStatus);
      setConnectionStatus('connected');

      pollingInterval.current = setInterval(async () => {
        const status = await HttpService.getStatus();
        
        if (status !== null) {
          setLiveUrnaStatus(status);
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('disconnected');
        }
      }, 2000);
    };

    if ((currentScreen === 'voting' || currentScreen === 'results')) {
      startPolling();
    } else if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, [currentScreen]);

  const handleCreateElection = async (electionData) => {
    setIsLoading(true);
    console.log('Iniciando criação de eleição...');

    try {
      const configSuccess = await HttpService.sendConfiguration(electionData);
      if (!configSuccess) {
        Alert.alert("Erro", "Não foi possível configurar a urna. Verifique a conexão.");
        return;
      }

      await HttpService.iniciarVotacao(electionData);

      setTimeout(await HttpService.iniciarVotacao2(electionData), 5000);
      

      await new Promise(resolve => setTimeout(resolve, 1500));

      const startSuccess = await HttpService.sendCommand('start');
      if (!startSuccess) {
        Alert.alert("Erro", "Não foi possível iniciar a eleição na urna.");
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const newElection = { 
        ...electionData, 
        id: Date.now().toString(), 
        status: 'active',
        createdAt: new Date().toISOString()
      };
      
      setElections(prev => [...prev, newElection]);
      setCurrentElection(newElection);
      setCurrentScreen('voting');
      
    } catch (error) {
      console.error('Erro na criação:', error);
      Alert.alert("Erro", "Erro inesperado ao criar eleição.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectElection = (election) => {
    setCurrentElection(election);
    if (election.status === 'active') {
      setCurrentScreen('voting');
    } else {
      setCurrentScreen('results');
    }
  };

  const handleEnableVoter = async () => {
    console.log('Habilitando próximo eleitor...');
    const success = await HttpService.sendCommand('enable');

    const success2 = await HttpService.habilitarMesario();
    
    if (!success) {
      Alert.alert("Erro", "Não foi possível habilitar o próximo eleitor.");
    }
  };

  const handleEndElection = () => {
    Alert.alert(
      'Confirmar Encerramento', 
      'Tem certeza que deseja encerrar a votação?', 
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Encerrar', 
          style: 'destructive', 
          onPress: async () => {
            console.log('Encerrando eleição...');
            
            try {
              if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
                pollingInterval.current = null;
              }
              
              setConnectionStatus('connecting');
              
              const success = await HttpService.sendCommand('end');
              
              if (!success) {
                Alert.alert("Erro", "Não foi possível encerrar a votação na urna.");
                setConnectionStatus('connected');
                return;
              }

              await new Promise(resolve => setTimeout(resolve, 2000));
              
              let finalStatus = null;
              let attempts = 0;
              const maxAttempts = 5;
              
              while (finalStatus === null && attempts < maxAttempts) {
                console.log(`Tentativa ${attempts + 1} de obter status final...`);
                finalStatus = await HttpService.getStatus();
                
                if (finalStatus === null) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
                attempts++;
              }
              
              if (finalStatus) {
                console.log('Status final obtido');
                await HttpService.encerrarVotacao(finalStatus);
                setLiveUrnaStatus(finalStatus);
                setConnectionStatus('connected');
              } else {
                console.log('Mantendo último status conhecido');
                setConnectionStatus('disconnected');
              }

              setElections(prev => prev.map(e => 
                e.id === currentElection.id 
                  ? {...e, status: 'finished', endedAt: new Date().toISOString()} 
                  : e
              ));
              
              setCurrentElection(prev => ({...prev, status: 'finished'}));
              setCurrentScreen('results');
              
            } catch (error) {
              console.error('Erro ao encerrar:', error);
              Alert.alert("Erro", "Erro inesperado ao encerrar votação.");
              setConnectionStatus('disconnected');
            }
          }
        }
      ]
    );
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return (
          <HomeScreen 
            elections={elections} 
            onCreateElection={() => setCurrentScreen('createElection')} 
            onSelectElection={handleSelectElection}
          />
        );
      case 'createElection':
        return (
          <CreateElectionScreen 
            onFinish={handleCreateElection} 
            onBack={() => setCurrentScreen('home')} 
          />
        );
      case 'voting':
        return (
          <VotingPanel 
            election={currentElection} 
            onEnableVoter={handleEnableVoter} 
            onEndElection={handleEndElection} 
            liveStatus={liveUrnaStatus} 
            connectionStatus={connectionStatus} 
            onBack={() => setCurrentScreen('home')} 
          />
        );
      case 'results':
        return (
          <ResultsScreen 
            election={currentElection} 
            liveStatus={liveUrnaStatus} 
            onBack={() => setCurrentScreen('home')} 
          />
        );
      default:
        return (
          <HomeScreen 
            elections={elections} 
            onCreateElection={() => setCurrentScreen('createElection')} 
            onSelectElection={handleSelectElection}
          />
        );
    }
  };

  return (
    <View style={styles.app}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Configurando urna...</Text>
        </View>
      )}
      
      {renderScreen()}
    </View>
  );
};

// =============================================================================
// FOLHA DE ESTILOS
// =============================================================================
const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.light,
  },
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: StatusBar.currentHeight || 16,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: StatusBar.currentHeight || 16,
    bottom: 0,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.dark,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  emptyText: {
    fontSize: 16,
    color: colors.gray,
    textAlign: 'center',
  },
  electionCard: {
    marginBottom: 12,
  },
  electionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  electionName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.dark,
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: colors.success
  },
  statusFinished: {
    backgroundColor: colors.gray
  },
  statusBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.dark,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lightGray,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.dark,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  voterTextArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  candidateItem: {
    fontSize: 14,
    color: colors.dark,
    paddingVertical: 4,
    paddingLeft: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
    marginBottom: 4,
  },
  voterItem: {
    fontSize: 14,
    color: colors.dark,
    paddingVertical: 2,
  },
  moreItems: {
    fontSize: 12,
    color: colors.gray,
    fontStyle: 'italic',
    marginTop: 4,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.secondary,
  },
  buttonError: {
    backgroundColor: colors.error,
  },
  buttonDisabled: {
    backgroundColor: colors.lightGray,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    color: colors.gray,
  },
  buttonIcon: {
    marginRight: 8,
  },
  bottomActions: {
    padding: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    flex: 1,
  },
  votingStats: {
    marginBottom: 24,
    padding: 20,
  },
  statsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.dark,
    marginBottom: 20,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },
  progressContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
  },
  progressText: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.lightGray,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 3,
    minWidth: 2,
  },
  mainAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButton: {
    paddingVertical: 24,
    paddingHorizontal: 32,
    minHeight: 80,
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  allVotedText: {
    fontSize: 16,
    color: colors.success,
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '600',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  resultsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.dark,
    textAlign: 'center',
    marginBottom: 8,
  },
  totalVotes: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
  },
  candidateResultName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  candidateResultVotes: {
    fontSize: 14,
    color: colors.gray,
  },
  otherVotesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.dark,
    marginBottom: 8,
  },
  otherVotes: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
});

export default ApuraFacilApp;