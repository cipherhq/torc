# Capacitor / Cordova WebView rules
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Google Play Services / Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.ktx.**

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Stripe
-keep class com.stripe.** { *; }
-dontwarn com.stripe.**

# Keep WebView JavaScript interfaces
-keepattributes JavascriptInterface
