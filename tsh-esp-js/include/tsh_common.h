#pragma once    

#ifdef __cplusplus
extern "C" {
#endif

// Helper for allocating new things
#define new(what) (what *)malloc(sizeof(what))

// Helper for allocating strings
#define new_string(len) (char *)malloc(len * sizeof(char) + 1)


#ifdef __cplusplus
}
#endif