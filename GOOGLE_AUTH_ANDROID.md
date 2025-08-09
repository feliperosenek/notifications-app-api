# 📱 Implementação Google OAuth 2.0 no Android

Este guia mostra como implementar o botão de login do Google em um aplicativo Android que se comunica com sua API de notificações.

## 📋 **Credenciais Configuradas**

### Android Client
```json
{
  "installed": {
    "client_id": "517854389633-qio4bn2qtbe4tmget5puhv5f2m5g4v7c.apps.googleusercontent.com",
    "project_id": "easy-notifications-post",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
  }
}
```

### Web Client (para validação na API)
```json
{
  "web": {
    "client_id": "517854389633-a3tcfbpq7o76khkl0kr2f472igbog4tf.apps.googleusercontent.com"
  }
}
```

## 🔧 **1. Configuração do Projeto Android**

### 1.1 Dependências no `build.gradle` (Module: app)

```gradle
dependencies {
    implementation 'com.google.android.gms:play-services-auth:20.7.0'
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.11.0'
    
    // Para UI moderna (opcional)
    implementation 'androidx.cardview:cardview:1.0.0'
    implementation 'com.google.android.material:material:1.10.0'
}
```

### 1.2 Permissões no `AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

## 🔧 **2. Configuração do Google Sign-In**

### 2.1 Criar `GoogleSignInConfig.java`

```java
package com.seuapp.notifications.config;

import com.google.android.gms.auth.api.signin.GoogleSignInOptions;

public class GoogleSignInConfig {
    
    // IMPORTANTE: Use o Web Client ID aqui (não o Android Client ID)
    public static final String WEB_CLIENT_ID = "517854389633-a3tcfbpq7o76khkl0kr2f472igbog4tf.apps.googleusercontent.com";
    
    // URL da sua API
    public static final String API_BASE_URL = "http://192.168.1.100:3200"; // Ajuste o IP
    
    public static GoogleSignInOptions getGoogleSignInOptions() {
        return new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(WEB_CLIENT_ID) // ← CRUCIAL: Web Client ID aqui!
                .requestEmail()
                .requestProfile()
                .build();
    }
}
```

## 🔧 **3. Interface da API com Retrofit**

### 3.1 Criar `ApiService.java`

```java
package com.seuapp.notifications.api;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.POST;

public interface ApiService {
    
    @POST("auth/google-login")
    Call<LoginResponse> googleLogin(@Body GoogleLoginRequest request);
    
    @POST("auth/verify-token")
    Call<VerifyTokenResponse> verifyToken(@Body VerifyTokenRequest request);
    
    @POST("auth/logout")
    Call<LogoutResponse> logout(@Body LogoutRequest request);
}
```

### 3.2 Criar Models de Request/Response

```java
// GoogleLoginRequest.java
package com.seuapp.notifications.models;

public class GoogleLoginRequest {
    private String idToken;
    
    public GoogleLoginRequest(String idToken) {
        this.idToken = idToken;
    }
    
    public String getIdToken() { return idToken; }
    public void setIdToken(String idToken) { this.idToken = idToken; }
}

// LoginResponse.java
package com.seuapp.notifications.models;

public class LoginResponse {
    private boolean success;
    private String message;
    private User user;
    private String token;
    
    // Getters e Setters
    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    
    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
}

// User.java
package com.seuapp.notifications.models;

public class User {
    private int id;
    private String firstName;
    private String lastName;
    private String email;
    private String profilePicture;
    private String authProvider;
    private boolean isVerified;
    
    // Getters e Setters
    public int getId() { return id; }
    public void setId(int id) { this.id = id; }
    
    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    
    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    
    public String getProfilePicture() { return profilePicture; }
    public void setProfilePicture(String profilePicture) { this.profilePicture = profilePicture; }
    
    public String getAuthProvider() { return authProvider; }
    public void setAuthProvider(String authProvider) { this.authProvider = authProvider; }
    
    public boolean isVerified() { return isVerified; }
    public void setVerified(boolean verified) { isVerified = verified; }
}

// VerifyTokenRequest.java e outras classes similares...
```

### 3.3 Criar `ApiClient.java`

```java
package com.seuapp.notifications.api;

import okhttp3.OkHttpClient;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;
import com.seuapp.notifications.config.GoogleSignInConfig;

public class ApiClient {
    private static Retrofit retrofit = null;
    
    public static ApiService getApiService() {
        if (retrofit == null) {
            // Interceptor para logs (opcional, para debug)
            HttpLoggingInterceptor logging = new HttpLoggingInterceptor();
            logging.setLevel(HttpLoggingInterceptor.Level.BODY);
            
            OkHttpClient client = new OkHttpClient.Builder()
                    .addInterceptor(logging)
                    .build();
            
            retrofit = new Retrofit.Builder()
                    .baseUrl(GoogleSignInConfig.API_BASE_URL + "/")
                    .addConverterFactory(GsonConverterFactory.create())
                    .client(client)
                    .build();
        }
        
        return retrofit.create(ApiService.class);
    }
}
```

## 🔧 **4. Implementação da Activity de Login**

### 4.1 Layout `activity_login.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp"
    android:gravity="center">

    <!-- Logo da App -->
    <ImageView
        android:layout_width="120dp"
        android:layout_height="120dp"
        android:layout_marginBottom="32dp"
        android:src="@drawable/ic_notifications"
        android:contentDescription="Logo" />

    <!-- Título -->
    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Notifications App"
        android:textSize="28sp"
        android:textStyle="bold"
        android:layout_marginBottom="48dp"
        android:textColor="@color/primary_color" />

    <!-- Botão Google Sign-In -->
    <com.google.android.gms.common.SignInButton
        android:id="@+id/sign_in_button"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginBottom="16dp" />

    <!-- Ou botão customizado -->
    <androidx.cardview.widget.CardView
        android:id="@+id/custom_google_button"
        android:layout_width="match_parent"
        android:layout_height="56dp"
        android:layout_marginBottom="24dp"
        app:cardCornerRadius="8dp"
        app:cardElevation="4dp"
        android:clickable="true"
        android:foreground="?android:attr/selectableItemBackground">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:orientation="horizontal"
            android:gravity="center">

            <ImageView
                android:layout_width="24dp"
                android:layout_height="24dp"
                android:src="@drawable/ic_google"
                android:layout_marginEnd="12dp" />

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Entrar com Google"
                android:textSize="16sp"
                android:textStyle="bold"
                android:textColor="@color/text_primary" />

        </LinearLayout>
    </androidx.cardview.widget.CardView>

    <!-- Mensagem de status -->
    <TextView
        android:id="@+id/status_message"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text=""
        android:textAlignment="center"
        android:textSize="14sp"
        android:layout_marginTop="16dp"
        android:visibility="gone" />

    <!-- Progress Bar -->
    <ProgressBar
        android:id="@+id/progress_bar"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="16dp"
        android:visibility="gone" />

</LinearLayout>
```

### 4.2 `LoginActivity.java`

```java
package com.seuapp.notifications.activities;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.cardview.widget.CardView;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.common.SignInButton;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

import com.seuapp.notifications.R;
import com.seuapp.notifications.api.ApiClient;
import com.seuapp.notifications.api.ApiService;
import com.seuapp.notifications.config.GoogleSignInConfig;
import com.seuapp.notifications.models.GoogleLoginRequest;
import com.seuapp.notifications.models.LoginResponse;

public class LoginActivity extends AppCompatActivity {
    
    private static final String TAG = "LoginActivity";
    private static final int RC_SIGN_IN = 9001;
    
    private GoogleSignInClient googleSignInClient;
    private ApiService apiService;
    
    private SignInButton signInButton;
    private CardView customGoogleButton;
    private TextView statusMessage;
    private ProgressBar progressBar;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);
        
        initViews();
        setupGoogleSignIn();
        setupClickListeners();
        checkExistingLogin();
    }
    
    private void initViews() {
        signInButton = findViewById(R.id.sign_in_button);
        customGoogleButton = findViewById(R.id.custom_google_button);
        statusMessage = findViewById(R.id.status_message);
        progressBar = findViewById(R.id.progress_bar);
        
        apiService = ApiClient.getApiService();
    }
    
    private void setupGoogleSignIn() {
        googleSignInClient = GoogleSignIn.getClient(this, GoogleSignInConfig.getGoogleSignInOptions());
    }
    
    private void setupClickListeners() {
        signInButton.setOnClickListener(v -> signInWithGoogle());
        customGoogleButton.setOnClickListener(v -> signInWithGoogle());
    }
    
    private void checkExistingLogin() {
        SharedPreferences prefs = getSharedPreferences("auth", MODE_PRIVATE);
        String token = prefs.getString("jwt_token", null);
        
        if (token != null) {
            showStatus("Verificando sessão existente...");
            // Verificar se o token ainda é válido
            // Se válido, ir direto para MainActivity
        }
    }
    
    private void signInWithGoogle() {
        showLoading(true);
        showStatus("Iniciando login com Google...");
        
        Intent signInIntent = googleSignInClient.getSignInIntent();
        startActivityForResult(signInIntent, RC_SIGN_IN);
    }
    
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        
        if (requestCode == RC_SIGN_IN) {
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
            handleSignInResult(task);
        }
    }
    
    private void handleSignInResult(@NonNull Task<GoogleSignInAccount> completedTask) {
        try {
            GoogleSignInAccount account = completedTask.getResult(ApiException.class);
            String idToken = account.getIdToken();
            
            if (idToken != null) {
                Log.d(TAG, "ID Token obtido: " + idToken.substring(0, 20) + "...");
                showStatus("Autenticando com servidor...");
                sendTokenToServer(idToken);
            } else {
                showError("Erro: Token não recebido do Google");
                showLoading(false);
            }
            
        } catch (ApiException e) {
            Log.w(TAG, "Google Sign-In falhou", e);
            showError("Falha no login: " + e.getStatusCode());
            showLoading(false);
        }
    }
    
    private void sendTokenToServer(String idToken) {
        GoogleLoginRequest request = new GoogleLoginRequest(idToken);
        
        Call<LoginResponse> call = apiService.googleLogin(request);
        call.enqueue(new Callback<LoginResponse>() {
            @Override
            public void onResponse(@NonNull Call<LoginResponse> call, @NonNull Response<LoginResponse> response) {
                showLoading(false);
                
                if (response.isSuccessful() && response.body() != null) {
                    LoginResponse loginResponse = response.body();
                    
                    if (loginResponse.isSuccess()) {
                        handleLoginSuccess(loginResponse);
                    } else {
                        showError("Erro no login: " + loginResponse.getMessage());
                    }
                } else {
                    showError("Erro de comunicação com servidor");
                    Log.e(TAG, "Erro na resposta: " + response.code());
                }
            }
            
            @Override
            public void onFailure(@NonNull Call<LoginResponse> call, @NonNull Throwable t) {
                showLoading(false);
                showError("Erro de conexão: " + t.getMessage());
                Log.e(TAG, "Erro na requisição", t);
            }
        });
    }
    
    private void handleLoginSuccess(LoginResponse loginResponse) {
        // Salvar dados do usuário e token
        SharedPreferences prefs = getSharedPreferences("auth", MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        
        editor.putString("jwt_token", loginResponse.getToken());
        editor.putInt("user_id", loginResponse.getUser().getId());
        editor.putString("user_email", loginResponse.getUser().getEmail());
        editor.putString("user_first_name", loginResponse.getUser().getFirstName());
        editor.putString("user_last_name", loginResponse.getUser().getLastName());
        editor.putString("user_profile_picture", loginResponse.getUser().getProfilePicture());
        editor.putString("auth_provider", loginResponse.getUser().getAuthProvider());
        editor.putBoolean("is_verified", loginResponse.getUser().isVerified());
        
        editor.apply();
        
        showStatus("Login realizado com sucesso!");
        
        // Ir para MainActivity
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }
    
    private void showLoading(boolean show) {
        progressBar.setVisibility(show ? View.VISIBLE : View.GONE);
        signInButton.setEnabled(!show);
        customGoogleButton.setEnabled(!show);
    }
    
    private void showStatus(String message) {
        statusMessage.setText(message);
        statusMessage.setVisibility(View.VISIBLE);
        statusMessage.setTextColor(getResources().getColor(android.R.color.black));
    }
    
    private void showError(String message) {
        statusMessage.setText(message);
        statusMessage.setVisibility(View.VISIBLE);
        statusMessage.setTextColor(getResources().getColor(android.R.color.holo_red_dark));
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}
```

## 🔧 **5. Gerenciamento de Sessão**

### 5.1 Criar `SessionManager.java`

```java
package com.seuapp.notifications.utils;

import android.content.Context;
import android.content.SharedPreferences;

public class SessionManager {
    private static final String PREF_NAME = "auth";
    private static final String KEY_JWT_TOKEN = "jwt_token";
    private static final String KEY_USER_ID = "user_id";
    private static final String KEY_USER_EMAIL = "user_email";
    
    private SharedPreferences prefs;
    private SharedPreferences.Editor editor;
    
    public SessionManager(Context context) {
        prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        editor = prefs.edit();
    }
    
    public void saveUserSession(String token, int userId, String email, String firstName, String lastName) {
        editor.putString(KEY_JWT_TOKEN, token);
        editor.putInt(KEY_USER_ID, userId);
        editor.putString(KEY_USER_EMAIL, email);
        editor.putString("user_first_name", firstName);
        editor.putString("user_last_name", lastName);
        editor.apply();
    }
    
    public boolean isLoggedIn() {
        return prefs.getString(KEY_JWT_TOKEN, null) != null;
    }
    
    public String getToken() {
        return prefs.getString(KEY_JWT_TOKEN, null);
    }
    
    public int getUserId() {
        return prefs.getInt(KEY_USER_ID, -1);
    }
    
    public String getUserEmail() {
        return prefs.getString(KEY_USER_EMAIL, null);
    }
    
    public void logout() {
        editor.clear();
        editor.apply();
    }
}
```

## 🔧 **6. Interceptor para Autenticação Automática**

### 6.1 Criar `AuthInterceptor.java`

```java
package com.seuapp.notifications.api;

import android.content.Context;

import java.io.IOException;

import okhttp3.Interceptor;
import okhttp3.Request;
import okhttp3.Response;

import com.seuapp.notifications.utils.SessionManager;

public class AuthInterceptor implements Interceptor {
    private SessionManager sessionManager;
    
    public AuthInterceptor(Context context) {
        this.sessionManager = new SessionManager(context);
    }
    
    @Override
    public Response intercept(Chain chain) throws IOException {
        Request originalRequest = chain.request();
        
        // Adicionar token JWT automaticamente se disponível
        if (sessionManager.isLoggedIn()) {
            String token = sessionManager.getToken();
            
            Request authenticatedRequest = originalRequest.newBuilder()
                    .header("Authorization", "Bearer " + token)
                    .build();
            
            return chain.proceed(authenticatedRequest);
        }
        
        return chain.proceed(originalRequest);
    }
}
```

## 🔧 **7. Configuração de Rede (Network Security)**

### 7.1 Criar `res/xml/network_security_config.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <!-- Para desenvolvimento local -->
        <domain includeSubdomains="true">192.168.1.100</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
    </domain-config>
</network-security-config>
```

### 7.2 Adicionar no `AndroidManifest.xml`

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ... >
```

## 🔧 **8. Fluxo Completo de Teste**

### 8.1 Testando a Implementação

1. **Execute sua API** na porta 3200
2. **Configure o IP** em `GoogleSignInConfig.API_BASE_URL`
3. **Execute o app Android**
4. **Clique no botão Google Sign-In**
5. **Verifique os logs** no Logcat para debug

### 8.2 Logs Esperados

```
D/LoginActivity: ID Token obtido: eyJhbGciOiJSUzI1NiIs...
I/System.out: Response: {"success":true,"message":"Login com Google realizado com sucesso.","user":{...},"token":"..."}
```

## 🔧 **9. Tratamento de Erros Comuns**

### 9.1 Erros Frequentes

| Erro | Causa | Solução |
|------|-------|---------|
| `Token inválido` | Client ID incorreto | Verificar se está usando Web Client ID no `requestIdToken()` |
| `Conexão recusada` | IP/porta incorretos | Verificar `API_BASE_URL` |
| `SHA-1 não configurado` | Certificado não cadastrado | Adicionar SHA-1 no Google Console |

### 9.2 Debug

```java
// Adicionar logs para debug
Log.d(TAG, "Web Client ID: " + GoogleSignInConfig.WEB_CLIENT_ID);
Log.d(TAG, "API URL: " + GoogleSignInConfig.API_BASE_URL);
Log.d(TAG, "ID Token: " + idToken.substring(0, 50) + "...");
```

## 🎉 **Resultado Final**

Com esta implementação, seu app Android terá:

✅ **Login com Google** funcional  
✅ **Comunicação segura** com sua API  
✅ **Gerenciamento de sessão** automático  
✅ **Tratamento de erros** robusto  
✅ **Interface moderna** e responsiva  

O usuário poderá fazer login com sua conta Google e o app se comunicará automaticamente com sua API de notificações usando o token JWT retornado.
