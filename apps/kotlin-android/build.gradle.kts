plugins {
    kotlin("multiplatform") version "2.2.0" apply false
    kotlin("native.cocoapods") version "2.2.0" apply false
    id("com.android.application") version "8.6.1" apply false
    id("com.android.library") version "8.6.1" apply false
    kotlin("plugin.serialization") version "2.2.0" apply false
    id("org.jetbrains.compose") version "1.8.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.0" apply false
    id("com.vanniktech.maven.publish") version "0.30.0" apply false
}
