#include <string.h>
#include <stdlib.h>
#include "pico/cyw43_arch.h"
#include "pico/stdlib.h"

#include "lwip/pbuf.h"
#include "lwip/tcp.h"

#include "dhcpserver.h"
#include "dnsserver.h"

// Módulos da Urna
#include "hardware/i2c.h"
#include "ssd1306/ssd1306.h"
#include "hardware/pwm.h"

#include "jsmn.h"

// CONFIGURAÇÕES DE REDE
#define AP_SSID "URNA_ELEICAO_2025"
#define AP_PASSWORD "12345678!"

// MAPEAMENTO DE HARDWARE
const uint ROW_PINS[] = {4, 8, 9, 16};
const uint COL_PINS[] = {17, 18, 19, 20};
const char KEY_MAP[4][4] = {
    {'1', '2', '3', 'A'}, {'4', '5', '6', 'B'},
    {'7', '8', '9', 'C'}, {'*', '0', '#', 'D'}
};
#define I2C_PORT i2c1
#define I2C_SDA_PIN 14
#define I2C_SCL_PIN 15
ssd1306_t disp;
#define BUZZER_PIN 21

// ESTRUTURAS DE DADOS E ESTADOS
typedef enum {
    WAITING_FOR_START, WAITING_FOR_ENABLE, READY_TO_VOTE, VOTING,
    SHOWING_CANDIDATE, VOTE_CONFIRMED, ELECTION_ENDED
} UrnaState;

typedef struct { char number[3]; char name[16]; int votes; } Candidate;
Candidate *candidates = NULL;
int NUM_CANDIDATES = 0;
int votes_blank = 0;
int votes_null = 0;

typedef struct TCP_CLIENT_STATE_T_ {
    struct tcp_pcb *pcb;
    ip_addr_t remote_addr;
    char http_request[256];
    int sent_len;
} TCP_CLIENT_STATE_T;

volatile UrnaState current_state = WAITING_FOR_START;
char current_vote_buffer[3] = "";
int input_pos = 0;

typedef struct TCP_SERVER_T_ {
    struct tcp_pcb *server_pcb;
    bool complete;
    ip_addr_t gw;
} TCP_SERVER_T;

typedef struct TCP_CONNECT_STATE_T_ {
    struct tcp_pcb *pcb;
    int sent_len;
    char headers[128];
    char result[2048];
    int header_len;
    int result_len;
    ip_addr_t *gw;
} TCP_CONNECT_STATE_T;

// FUNÇÕES DE HARDWARE 
void setup_hardware() {
    for (int i = 0; i < 4; i++) {
        gpio_init(ROW_PINS[i]); gpio_set_dir(ROW_PINS[i], GPIO_OUT);
        gpio_init(COL_PINS[i]); gpio_set_dir(COL_PINS[i], GPIO_IN); gpio_pull_down(COL_PINS[i]);
    }
    gpio_set_function(BUZZER_PIN, GPIO_FUNC_PWM);
    i2c_init(I2C_PORT, 400 * 1000);
    gpio_set_function(I2C_SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(I2C_SCL_PIN, GPIO_FUNC_I2C);
    gpio_pull_up(I2C_SDA_PIN); gpio_pull_up(I2C_SCL_PIN);
    disp.external_vcc = false;
    ssd1306_init(&disp, 128, 64, 0x3C, I2C_PORT);
}

void play_sound(uint freq, uint duration_ms) {
    uint slice_num = pwm_gpio_to_slice_num(BUZZER_PIN);
    pwm_set_enabled(slice_num, true);
    uint32_t wrap = 125000000 / freq; 
    pwm_set_wrap(slice_num, wrap); pwm_set_clkdiv(slice_num, 1);
    pwm_set_gpio_level(BUZZER_PIN, wrap / 2);
    sleep_ms(duration_ms);
    pwm_set_gpio_level(BUZZER_PIN, 0);
    pwm_set_enabled(slice_num, false);
}
void play_confirmation_sound() { play_sound(1200, 150); sleep_ms(50); play_sound(1500, 300); }

char scan_keypad() {
    for (int r = 0; r < 4; r++) {
        gpio_put(ROW_PINS[r], 1); sleep_us(50);
        for (int c = 0; c < 4; c++) {
            if (gpio_get(COL_PINS[c])) {
                gpio_put(ROW_PINS[r], 0); return KEY_MAP[r][c];
            }
        }
        gpio_put(ROW_PINS[r], 0);
    }
    return '\0';
}
void reset_vote_state() { input_pos = 0; memset(current_vote_buffer, 0, sizeof(current_vote_buffer)); }

void update_oled_display() {
    ssd1306_clear(&disp); char line[32];
    switch(current_state) {
        case WAITING_FOR_START: ssd1306_draw_string(&disp, 0, 24, 1, "Aguardando inicio..."); break;
        case WAITING_FOR_ENABLE: ssd1306_draw_string(&disp, 5, 24, 1, "Aguardando Mesario..."); break;
        case READY_TO_VOTE: ssd1306_draw_string(&disp, 10, 24, 2, "URNA PRONTA"); break;
        case VOTING: ssd1306_draw_string(&disp, 0, 10, 1, "Numero:"); ssd1306_draw_string(&disp, 40, 24, 3, current_vote_buffer); break;
        case SHOWING_CANDIDATE: {
            bool found = false;
            for (int i = 0; i < NUM_CANDIDATES; i++) {
                if (strcmp(current_vote_buffer, candidates[i].number) == 0) {
                    ssd1306_draw_string(&disp, 0, 16, 2, candidates[i].name); found = true; break;
                }
            }
            if (!found) ssd1306_draw_string(&disp, 10, 16, 2, "VOTO NULO");
            ssd1306_draw_string(&disp, 0, 48, 1, "A=Conf B=Corr D=Branco");
            break;
        }
        case VOTE_CONFIRMED: ssd1306_draw_string(&disp, 45, 24, 3, "FIM"); break;
        case ELECTION_ENDED:
            ssd1306_draw_string(&disp, 10, 0, 1, "-- RESULTADO --");
            for (int i = 0; i < NUM_CANDIDATES; i++) {
                sprintf(line, "%s: %d", candidates[i].name, candidates[i].votes);
                ssd1306_draw_string(&disp, 0, 16 + (i * 10), 1, line);
            }
            sprintf(line, "Brancos: %d", votes_blank);
            ssd1306_draw_string(&disp, 0, 16 + (NUM_CANDIDATES * 10), 1, line);
            sprintf(line, "Nulos: %d", votes_null);
            ssd1306_draw_string(&disp, 0, 16 + ((NUM_CANDIDATES+1) * 10), 1, line);
            break;
    }
    ssd1306_show(&disp);
}

static void tcp_client_close(TCP_CLIENT_STATE_T *state) {
    if (state->pcb) {
        tcp_arg(state->pcb, NULL);
        tcp_poll(state->pcb, NULL, 0);
        tcp_sent(state->pcb, NULL);
        tcp_recv(state->pcb, NULL);
        tcp_err(state->pcb, NULL);
        tcp_close(state->pcb);
        state->pcb = NULL; // Evita double free
    }
    free(state);
}

// Callback chamado quando os dados foram enviados com sucesso
static err_t tcp_client_sent(void *arg, struct tcp_pcb *pcb, u16_t len) {
    TCP_CLIENT_STATE_T *state = (TCP_CLIENT_STATE_T*)arg;
    state->sent_len += len;

    // Se todo o request foi enviado, podemos fechar a conexão
    if (state->sent_len >= strlen(state->http_request)) {
        printf("Requisição para o servidor Flask enviada, fechando conexão.\n");
        tcp_client_close(state);
    }
    return ERR_OK;
}

// Callback chamado quando a conexão é estabelecida com sucesso
static err_t tcp_client_connected(void *arg, struct tcp_pcb *pcb, err_t err) {
    if (err != ERR_OK) {
        printf("Erro ao conectar ao cliente: %d\n", err);
        tcp_client_close(arg);
        return err;
    }
    TCP_CLIENT_STATE_T *state = (TCP_CLIENT_STATE_T*)arg;
    printf("Conectado ao servidor Flask, enviando dados...\n");

    // Agora que estamos conectados, definimos o callback de envio e enviamos os dados
    tcp_sent(pcb, tcp_client_sent);
    tcp_write(pcb, state->http_request, strlen(state->http_request), TCP_WRITE_FLAG_COPY);
    tcp_output(pcb);

    return ERR_OK;
}

// Callback de erro
static void tcp_client_err(void *arg, err_t err) {
    printf("Erro na conexão do cliente TCP: %d\n", err);
    tcp_client_close(arg);
}

void send_key_to_server(const char* key) {
    // Aloca estado dinamicamente, pois a operação é assíncrona
    TCP_CLIENT_STATE_T *state = calloc(1, sizeof(TCP_CLIENT_STATE_T));
    if (!state) {
        printf("Falha ao alocar estado do cliente TCP\n");
        return;
    }

    const char* server_ip = "192.168.4.16"; // IP do computador com Flask
    const uint16_t server_port = 8080;
    ipaddr_aton(server_ip, &state->remote_addr);

    char json_payload[64];
    snprintf(json_payload, sizeof(json_payload),
             "{\"command\":\"tecla\",\"tecla\":\"%s\"}", key);

    // Monta a requisição completa e armazena no estado
    snprintf(state->http_request, sizeof(state->http_request),
             "POST /comando HTTP/1.1\r\n"
             "Host: %s:%d\r\n"
             "Content-Type: application/json\r\n"
             "Content-Length: %d\r\n"
             "Connection: close\r\n\r\n"
             "%s",
             server_ip, server_port, strlen(json_payload), json_payload);

    struct tcp_pcb *pcb = tcp_new();
    if (!pcb) {
        printf("Falha ao criar PCB do cliente\n");
        free(state);
        return;
    }

    state->pcb = pcb;
    tcp_arg(pcb, state); // Passa nosso estado para os callbacks
    tcp_err(pcb, tcp_client_err);

    // Inicia a conexão. O callback tcp_client_connected será chamado quando conectar.
    err_t err = tcp_connect(pcb, &state->remote_addr, server_port, tcp_client_connected);
    if (err != ERR_OK) {
        printf("Erro ao iniciar conexão com cliente: %d\n", err);
        tcp_client_close(state);
    }
}

// LÓGICA DA URNA
void urna_loop() {
    update_oled_display();
    if (current_state != READY_TO_VOTE && current_state != VOTING && current_state != SHOWING_CANDIDATE) return;
    char key = scan_keypad();
    if (key != '\0') {
        char key_str[2] = {key, '\0'};
        send_key_to_server(key_str);
        if (current_state == READY_TO_VOTE && (key >= '0' && key <= '9')) current_state = VOTING;
        if (current_state == VOTING) {
            if (key >= '0' && key <= '9' && input_pos < 2) {
                current_vote_buffer[input_pos++] = key; current_vote_buffer[input_pos] = '\0';
                play_sound(800, 100);
                if (input_pos == 2) current_state = SHOWING_CANDIDATE;
            }
        }
        switch(key) {
            case 'A': if (current_state == SHOWING_CANDIDATE) {
                bool found = false;
                for (int i = 0; i < NUM_CANDIDATES; i++) {
                    if (strcmp(current_vote_buffer, candidates[i].number) == 0) { candidates[i].votes++; found = true; break; }
                }
                if (!found) votes_null++;
                current_state = VOTE_CONFIRMED; update_oled_display(); play_confirmation_sound(); sleep_ms(2000);
                reset_vote_state(); current_state = WAITING_FOR_ENABLE;
            } break;
            case 'B': reset_vote_state(); current_state = READY_TO_VOTE; break;
            case 'D': if (current_state == READY_TO_VOTE) {
                votes_blank++; current_state = VOTE_CONFIRMED;
                update_oled_display(); play_confirmation_sound(); sleep_ms(2000);
                reset_vote_state(); current_state = WAITING_FOR_ENABLE;
            } break;
        }
        while(scan_keypad() != '\0') { sleep_ms(20); }
    }
}

void create_status_json(char* buffer, size_t len) {
    char candidates_json[1024] = "";
    char temp[128];
    
    for (int i = 0; i < NUM_CANDIDATES; i++) {
        sprintf(temp, "{\"name\":\"%s\",\"number\":\"%s\",\"votes\":%d}%s",
                candidates[i].name, candidates[i].number, candidates[i].votes,
                i < NUM_CANDIDATES - 1 ? "," : "");
        strcat(candidates_json, temp);
    }
    
    int json_len = snprintf(buffer, len,
        "{\"state\":%d,\"candidates\":[%s],\"blank_votes\":%d,\"null_votes\":%d}",
        current_state, candidates_json, votes_blank, votes_null
    );
    
    printf("JSON Status criado (len=%d): %s\n", json_len, buffer); // Debug
}

static int jsoneq(const char *json, jsmntok_t *tok, const char *s) {
    if (tok->type == JSMN_STRING && (int)strlen(s) == tok->end - tok->start &&
        strncmp(json + tok->start, s, tok->end - tok->start) == 0) {
        return 0;
    }
    return -1;
}

err_t tcp_close_client_connection(TCP_CONNECT_STATE_T *con_state, struct tcp_pcb *client_pcb, err_t close_err) { if (client_pcb) { assert(con_state && con_state->pcb == client_pcb); tcp_arg(client_pcb, NULL); tcp_poll(client_pcb, NULL, 0); tcp_sent(client_pcb, NULL); tcp_recv(client_pcb, NULL); tcp_err(client_pcb, NULL); err_t err = tcp_close(client_pcb); if (err != ERR_OK) { tcp_abort(client_pcb); close_err = ERR_ABRT; } if (con_state) { free(con_state); } } return close_err; }

// Callback que processa as requisições
err_t tcp_server_recv(void *arg, struct tcp_pcb *pcb, struct pbuf *p, err_t err) {
    TCP_CONNECT_STATE_T *con_state = (TCP_CONNECT_STATE_T*)arg;
    if (!p) { return tcp_close_client_connection(con_state, pcb, ERR_OK); }
   
    if (p->tot_len > 0) {
        char* request_payload = malloc(p->tot_len + 1);
        pbuf_copy_partial(p, request_payload, p->tot_len, 0);
        request_payload[p->tot_len] = '\0';

        printf("Requisicao recebida: %s\n", request_payload); // Debug

        // API JSON para status
        if (strncmp("GET /status", request_payload, 11) == 0) {
            printf("Enviando status JSON\n");
            create_status_json(con_state->result, sizeof(con_state->result));
            con_state->header_len = snprintf(con_state->headers, sizeof(con_state->headers), 
                "HTTP/1.1 200 OK\r\n"
                "Content-Length: %d\r\n"
                "Content-Type: application/json\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\n", 
                strlen(con_state->result));
            con_state->result_len = strlen(con_state->result);
        }
        // Configuração de candidatos
        else if (strncmp("POST /configure", request_payload, 15) == 0) {
            printf("Recebido comando de configuracao!\n");
            if (candidates) { free(candidates); candidates = NULL; NUM_CANDIDATES = 0; }
           
            char *json_body = strstr(request_payload, "\r\n\r\n");
            if (json_body) {
                json_body += 4;
                jsmn_parser parser; jsmntok_t tokens[128];
                jsmn_init(&parser);
                int r = jsmn_parse(&parser, json_body, strlen(json_body), tokens, 128);

                if (r > 0 && tokens[0].type == JSMN_ARRAY) {
                    NUM_CANDIDATES = tokens[0].size;
                    candidates = malloc(NUM_CANDIDATES * sizeof(Candidate));
                   
                    int token_idx = 1;
                    for (int i = 0; i < NUM_CANDIDATES; i++) {
                        token_idx++; // Pula o token do objeto
                        for (int j = 0; j < 2; j++) { // name e number
                            jsmntok_t *key = &tokens[token_idx];
                            jsmntok_t *val = &tokens[token_idx+1];
                            if (jsoneq(json_body, key, "name") == 0) {
                                snprintf(candidates[i].name, sizeof(candidates[i].name), "%.*s", 
                                    val->end - val->start, json_body + val->start);
                            } else if (jsoneq(json_body, key, "number") == 0) {
                                snprintf(candidates[i].number, sizeof(candidates[i].number), "%.*s", 
                                    val->end - val->start, json_body + val->start);
                            }
                            token_idx += 2;
                        }
                        candidates[i].votes = 0;
                        printf("Candidato cadastrado: %s - %s\n", candidates[i].name, candidates[i].number);
                    }
                }
            }
            
            con_state->header_len = snprintf(con_state->headers, sizeof(con_state->headers), 
                "HTTP/1.1 200 OK\r\n"
                "Content-Length: 2\r\n"
                "Content-Type: application/json\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\n");
            strcpy(con_state->result, "OK");
            con_state->result_len = 2;
        }
        // Comandos simples
        else if (strncmp("GET /start", request_payload, 10) == 0) {
            printf("Comando START recebido\n");
            for (int i = 0; i < NUM_CANDIDATES; i++) candidates[i].votes = 0;
            votes_blank = 0; 
            votes_null = 0;
            reset_vote_state(); 
            current_state = WAITING_FOR_ENABLE;
            
            con_state->header_len = snprintf(con_state->headers, sizeof(con_state->headers), 
                "HTTP/1.1 200 OK\r\n"
                "Content-Length: 2\r\n"
                "Content-Type: text/plain\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\n");
            strcpy(con_state->result, "OK");
            con_state->result_len = 2;
        } 
        else if (strncmp("GET /enable", request_payload, 11) == 0) {
            printf("Comando ENABLE recebido\n");
            if (current_state == WAITING_FOR_ENABLE || current_state == VOTE_CONFIRMED) {
                reset_vote_state(); 
                current_state = READY_TO_VOTE;
            }
            
            con_state->header_len = snprintf(con_state->headers, sizeof(con_state->headers), 
                "HTTP/1.1 200 OK\r\n"
                "Content-Length: 2\r\n"
                "Content-Type: text/plain\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\n");
            strcpy(con_state->result, "OK");
            con_state->result_len = 2;
        } 
        else if (strncmp("GET /end", request_payload, 8) == 0) {
            printf("Comando END recebido\n");
            current_state = ELECTION_ENDED;
            
            con_state->header_len = snprintf(con_state->headers, sizeof(con_state->headers), 
                "HTTP/1.1 200 OK\r\n"
                "Content-Length: 2\r\n"
                "Content-Type: text/plain\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\n");
            strcpy(con_state->result, "OK");
            con_state->result_len = 2;
        }
        // Requisições não reconhecidas
        else {
            printf("Requisicao nao reconhecida\n");
            con_state->header_len = snprintf(con_state->headers, sizeof(con_state->headers), 
                "HTTP/1.1 404 Not Found\r\n"
                "Content-Length: 9\r\n"
                "Content-Type: text/plain\r\n"
                "Connection: close\r\n\r\n");
            strcpy(con_state->result, "Not Found");
            con_state->result_len = 9;
        }
       
        // Envia resposta
        tcp_write(pcb, con_state->headers, con_state->header_len, 0);
        if(con_state->result_len > 0) {
            tcp_write(pcb, con_state->result, con_state->result_len, 0);
        }
        tcp_recved(pcb, p->tot_len);
        free(request_payload);
    }
    pbuf_free(p);
    return ERR_OK;
}

// FUNÇÕES DO SERVIDOR WEB (do exemplo oficial, adaptadas)

void tcp_server_close(TCP_SERVER_T *state) { if (state->server_pcb) { tcp_arg(state->server_pcb, NULL); tcp_close(state->server_pcb); state->server_pcb = NULL; } }
err_t tcp_server_sent(void *arg, struct tcp_pcb *pcb, u16_t len) { TCP_CONNECT_STATE_T *con_state = (TCP_CONNECT_STATE_T*)arg; con_state->sent_len += len; if (con_state->sent_len >= con_state->header_len + con_state->result_len) { return tcp_close_client_connection(con_state, pcb, ERR_OK); } return ERR_OK; }
void tcp_server_err(void *arg, err_t err) { TCP_CONNECT_STATE_T *con_state = (TCP_CONNECT_STATE_T*)arg; if (err != ERR_ABRT) { tcp_close_client_connection(con_state, con_state->pcb, err); } }
err_t tcp_server_poll(void *arg, struct tcp_pcb *pcb) { TCP_CONNECT_STATE_T *con_state = (TCP_CONNECT_STATE_T*)arg; return tcp_close_client_connection(con_state, pcb, ERR_OK); }
err_t tcp_server_accept(void *arg, struct tcp_pcb *client_pcb, err_t err) { TCP_SERVER_T *state = (TCP_SERVER_T*)arg; if (err != ERR_OK || client_pcb == NULL) { return ERR_VAL; } TCP_CONNECT_STATE_T *con_state = calloc(1, sizeof(TCP_CONNECT_STATE_T)); if (!con_state) { return ERR_MEM; } con_state->pcb = client_pcb; con_state->gw = &state->gw; tcp_arg(client_pcb, con_state); tcp_sent(client_pcb, tcp_server_sent); tcp_recv(client_pcb, tcp_server_recv); tcp_poll(client_pcb, tcp_server_poll, 5 * 2); tcp_err(client_pcb, tcp_server_err); return ERR_OK; }
bool tcp_server_open(void *arg) { TCP_SERVER_T *state = (TCP_SERVER_T*)arg; struct tcp_pcb *pcb = tcp_new_ip_type(IPADDR_TYPE_ANY); if (!pcb) return false; err_t err = tcp_bind(pcb, IP_ANY_TYPE, 80); if (err) { tcp_close(pcb); return false; } state->server_pcb = tcp_listen_with_backlog(pcb, 5); if (!state->server_pcb) { if (pcb) tcp_close(pcb); return false; } tcp_arg(state->server_pcb, state); tcp_accept(state->server_pcb, tcp_server_accept); return true; }

// FUNÇÃO MAIN
int main() {
    stdio_init_all();
    setup_hardware();
    sleep_ms(2500);

    TCP_SERVER_T *state = calloc(1, sizeof(TCP_SERVER_T));
    if (!state) { return 1; }

    if (cyw43_arch_init()) { return 1; }

    cyw43_arch_enable_ap_mode(AP_SSID, AP_PASSWORD, CYW43_AUTH_WPA2_AES_PSK);
    
    ip4_addr_t mask;
    ip4addr_aton("255.255.255.0", &mask);
    ip4addr_aton("192.168.4.1", &state->gw);

    struct netif *netif = &cyw43_state.netif[CYW43_ITF_AP];
    netif_set_addr(netif, &state->gw, &mask, &state->gw);

    dhcp_server_t dhcp_server;
    dhcp_server_init(&dhcp_server, &state->gw, &mask);

    // dns_server_t dns_server;
    // dns_server_init(&dns_server, &state->gw);

    if (!tcp_server_open(state)) { return 1; }

    printf("Ponto de Acesso '%s' criado.\n", AP_SSID);
    printf("Conecte e acesse http://%s\n", ip4addr_ntoa(&state->gw));

    state->complete = false;
    while(!state->complete) {
        cyw43_arch_poll();
        urna_loop();
        sleep_ms(50);
    }

    tcp_server_close(state);
    // dns_server_deinit(&dns_server);
    dhcp_server_deinit(&dhcp_server);
    cyw43_arch_deinit();
    free(state);
    return 0;
}
